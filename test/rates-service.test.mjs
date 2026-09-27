import assert from "node:assert/strict";
import test from "node:test";

import { RatesService } from "../src/background/RatesService.js";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.js";
import { Settings } from "../src/core/settings/Settings.js";
import { fakeStore } from "./support/fakes.mjs";

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

test("refreshes the saved rates for the saved currency", async () => {
  const store = fakeStore(GBP);
  const service = new RatesService({ store, client: countingClient() });
  assert.equal(await service.refreshSaved(), true);
  assert.deepEqual(store.savedRates, [new ExchangeRates("GBP", "1", { EUR: 1.1 })]);
});

test("keeps the saved rates when the refresh fails", async (t) => {
  t.mock.method(console, "warn", () => {});
  const store = fakeStore(GBP);
  const service = new RatesService({ store, client: countingClient({ fail: true }) });
  assert.equal(await service.refreshSaved(), false);
  assert.deepEqual(store.savedRates, []);
});

test("does not save rates for a currency that was changed meanwhile", async () => {
  const store = fakeStore(GBP);
  const client = {
    async fetch(base) {
      await store.change(new Settings({ auctionPremium: 0, shipment: 0, currency: "USD" }));
      return ExchangeRates.empty(base);
    },
  };
  const service = new RatesService({ store, client });
  assert.equal(await service.refreshSaved(), false);
  assert.deepEqual(store.savedRates, []);
});
