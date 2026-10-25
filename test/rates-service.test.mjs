import assert from "node:assert/strict";
import test from "node:test";

import { RatesService } from "../src/background/RatesService.js";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.js";
import { Settings } from "../src/core/settings/Settings.js";
import { bookOf, fakeStore } from "./support/fakes.mjs";

const HOUR = 60 * 60 * 1000;
const GBP = new Settings({ auctionPremium: 0, shipment: 0, currency: "GBP" });

/** A rates client counting its requests; each answer carries the request number as date. */
function countingClient({ fail = false } = {}) {
  return {
    requests: /** @type {string[]} */ ([]),
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

test("fails when the rates cannot be loaded", async () => {
  const service = new RatesService({ store: fakeStore(), client: countingClient({ fail: true }) });
  await assert.rejects(service.get("GBP"), /offline/);
});

test("refreshes the rates of every saved currency and of the default one", async () => {
  const store = fakeStore({ book: bookOf([{ site: "https://a.test" }, GBP]) });
  const client = countingClient();
  const service = new RatesService({ store, client });
  assert.deepEqual(await service.refreshSaved(), ["EUR", "GBP"]);
  assert.deepEqual(client.requests, ["EUR", "GBP"]);
  assert.deepEqual(store.savedRates, [
    new ExchangeRates("EUR", "1", { EUR: 1.1 }),
    new ExchangeRates("GBP", "2", { EUR: 1.1 }),
  ]);
});

test("keeps the saved rates of a currency whose refresh fails", async (t) => {
  t.mock.method(console, "warn", () => {});
  const store = fakeStore({ book: bookOf([{ site: "https://a.test" }, GBP]) });
  const client = {
    async fetch(base) {
      if (base === "GBP") throw new Error("offline");
      return ExchangeRates.empty(base);
    },
  };
  const service = new RatesService({ store, client });
  assert.deepEqual(await service.refreshSaved(), ["EUR"]);
  assert.deepEqual(store.savedRates, [ExchangeRates.empty("EUR")]);
});
