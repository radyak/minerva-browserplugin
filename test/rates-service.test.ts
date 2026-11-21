import assert from "node:assert/strict";
import { test, vi } from "vitest";

import { RatesService } from "../src/background/RatesService.ts";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.ts";
import { Settings } from "../src/core/settings/Settings.ts";
import { bookOf, fakeStore } from "./support/fakes.ts";

const HOUR = 60 * 60 * 1000;
const GBP = new Settings({ auctionPremium: 0, shipment: 0, currency: "GBP" });

/** A rates client counting its requests; each answer carries the request number as date. */
function countingClient({ fail = false } = {}) {
  return {
    requests: [] as string[],
    async currencies() {
      this.requests.push("currencies");
      if (fail) throw new Error("offline");
      return [{ code: "EUR", name: "Euro" }];
    },
    async fetch(base) {
      this.requests.push(base);
      if (fail) throw new Error("offline");
      return new ExchangeRates(base, String(this.requests.length), { EUR: 1.1 });
    },
  };
}

test("reuses fetched rates for an hour", async () => {
  let now = 0;
  const client = countingClient();
  const service = new RatesService({ store: fakeStore(), client, now: () => now });
  await service.get("GBP");
  now = HOUR - 1;
  await service.get("GBP");
  await service.get("USD");
  now = HOUR;
  assert.equal((await service.get("GBP")).date, "3");
  assert.deepEqual(client.requests, ["GBP", "USD", "GBP"]);
});

test("fetches again when asked for fresh rates", async () => {
  const client = countingClient();
  const service = new RatesService({ store: fakeStore(), client, now: () => 0 });
  await service.get("GBP");
  await service.get("GBP", { fresh: true });
  assert.deepEqual(client.requests, ["GBP", "GBP"]);
});

test("reuses the list of currencies for a day", async () => {
  let now = 0;
  const client = countingClient();
  const service = new RatesService({ store: fakeStore(), client, now: () => now });
  assert.deepEqual(await service.currencies(), [{ code: "EUR", name: "Euro" }]);
  now = 24 * HOUR - 1;
  await service.currencies();
  now = 24 * HOUR;
  await service.currencies();
  assert.deepEqual(client.requests, ["currencies", "currencies"]);
  await assert.rejects(
    new RatesService({ store: fakeStore(), client: countingClient({ fail: true }) }).currencies(),
    /offline/,
  );
});

test("fails when the rates cannot be loaded", async () => {
  const service = new RatesService({ store: fakeStore(), client: countingClient({ fail: true }) });
  await assert.rejects(service.get("GBP"), /offline/);
});

test("refreshes the rates of the user's currency", async () => {
  const store = fakeStore({ book: bookOf([{ site: "https://a.test" }, GBP]) });
  const client = countingClient();
  const service = new RatesService({ store, client });
  assert.deepEqual(await service.refreshSaved(), ["GBP"]);
  assert.deepEqual(client.requests, ["GBP"]);
  assert.deepEqual(store.savedRates, [new ExchangeRates("GBP", "1", { EUR: 1.1 })]);
});

test("refreshes the rates of the default currency while none is saved", async () => {
  const store = fakeStore();
  const client = countingClient();
  assert.deepEqual(await new RatesService({ store, client }).refreshSaved(), ["EUR"]);
});

test("keeps the saved rates of a currency whose refresh fails", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const store = fakeStore({ book: bookOf([{ site: "https://a.test" }, GBP]) });
  const client = {
    currencies: async () => [],
    async fetch(base) {
      if (base === "GBP") throw new Error("offline");
      return ExchangeRates.empty(base);
    },
  };
  const service = new RatesService({ store, client });
  assert.deepEqual(await service.refreshSaved(), []);
  assert.deepEqual(store.savedRates, []);
});
