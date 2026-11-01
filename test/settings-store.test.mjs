import assert from "node:assert/strict";
import test from "node:test";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { ExchangeRates } from "../src/core/rates/ExchangeRates.ts";
import { AuctionKey } from "../src/core/settings/AuctionKey.ts";
import { Settings } from "../src/core/settings/Settings.ts";

// SettingsStore uses wxt/utils/storage, which binds to the global extension API
// when it is first imported: put WXT's in-memory fake there before.
Object.assign(globalThis, { browser: fakeBrowser });
const { SettingsStore } = await import("../src/browser/SettingsStore.ts");

const local = fakeBrowser.storage.local;

/**
 * Start `t` with exactly `initial` in storage.local; records every write from then on.
 * @param {import("node:test").TestContext} t
 * @param {Record<string, unknown>} [initial]
 */
async function storageWith(t, initial = {}) {
  fakeBrowser.reset();
  await local.set(initial);
  const writes = [];
  const set = local.set.bind(local);
  t.mock.method(local, "set", (items) => {
    writes.push(structuredClone(items));
    return set(items);
  });
  return { writes, data: async () => /** @type {Record<string, any>} */ (await local.get()) };
}

const GBP = new Settings({ auctionPremium: 20, shipment: 15, currency: "GBP" });
const CHF = new Settings({ auctionPremium: 18, shipment: 30, currency: "CHF" });
const GBP_RATES = new ExchangeRates("GBP", "2026-09-25", { EUR: 1.16, USD: 1.32 });
const CHF_RATES = new ExchangeRates("CHF", "2026-09-25", { EUR: 1.07 });
const BIDDR = "https://www.biddr.com";
const AUCTION = new AuctionKey({ site: BIDDR, house: "leu", auction: "7" });
const SITE = new AuctionKey({ site: BIDDR });

test("loads an empty book and no rates when nothing is saved", async (t) => {
  await storageWith(t);
  const { book, rates } = await new SettingsStore().load();
  assert.deepEqual(book.entries, []);
  assert.deepEqual(rates, {});
});

test("saves settings and their rates in one write and loads them back", async (t) => {
  const { writes, data } = await storageWith(t);
  const store = new SettingsStore();
  await store.save(AUCTION, GBP, GBP_RATES);
  assert.equal(writes.length, 1);
  assert.deepEqual(await data(), {
    auctionSettings: [{ site: BIDDR, house: "leu", auction: "7", settings: GBP.toJSON() }],
    exchangeRates: { GBP: GBP_RATES.toJSON() },
  });
  const { book, rates } = await store.load();
  assert.deepEqual(book.resolve(AUCTION)?.settings, GBP);
  assert.deepEqual(rates, { GBP: GBP_RATES });
});

test("keeps the settings of other auctions and the rates of other currencies", async (t) => {
  const { data } = await storageWith(t);
  const store = new SettingsStore();
  await store.save(SITE, CHF, CHF_RATES);
  await store.save(AUCTION, GBP, GBP_RATES);
  await store.save(AUCTION, Settings.from({ ...GBP.toJSON(), shipment: 9 }));
  const { book, rates } = await store.load();
  assert.deepEqual(
    book.entries.map(({ key, settings }) => [key, settings.shipment]),
    [
      [SITE, 30],
      [AUCTION, 9],
    ],
  );
  assert.deepEqual(rates, { CHF: CHF_RATES, GBP: GBP_RATES });

  await store.saveRates(ExchangeRates.empty("CHF"));
  const saved = await data();
  assert.deepEqual(saved.exchangeRates.GBP, GBP_RATES.toJSON());
  assert.equal(saved.auctionSettings.length, 2);
});

test("ignores rates saved under another currency than their base", async (t) => {
  await storageWith(t, { exchangeRates: { EUR: GBP_RATES.toJSON(), GBP: GBP_RATES.toJSON() } });
  const { rates } = await new SettingsStore().load();
  assert.deepEqual(rates, { GBP: GBP_RATES });
});

test("reads malformed stored data as nothing saved", async (t) => {
  await storageWith(t, { auctionSettings: "broken", exchangeRates: 42 });
  const { book, rates } = await new SettingsStore().load();
  assert.deepEqual(book.entries, []);
  assert.deepEqual(rates, {});
});

test("reports changes of its own keys in local storage only", async (t) => {
  await storageWith(t);
  let calls = 0;
  new SettingsStore().onChange(() => (calls += 1));
  await local.set({ auctionSettings: [] });
  await local.set({ exchangeRates: { GBP: GBP_RATES.toJSON() } });
  await local.set({ unrelated: 1 });
  await fakeBrowser.storage.sync.set({ auctionSettings: [{ site: BIDDR }] });
  assert.equal(calls, 2);
});

test("a save is one change event; every notification sees settings and rates together", async (t) => {
  await storageWith(t);
  const store = new SettingsStore();
  let events = 0;
  local.onChanged.addListener(() => (events += 1));
  const seen = [];
  store.onChange(() => seen.push(store.load()));
  await store.save(AUCTION, GBP, GBP_RATES);
  assert.equal(events, 1);
  // Once per changed key (WXT watches keys one by one), always with both new values.
  assert.equal(seen.length, 2);
  for (const { book, rates } of await Promise.all(seen)) {
    assert.deepEqual(book.resolve(AUCTION)?.settings, GBP);
    assert.deepEqual(rates, { GBP: GBP_RATES });
  }
});

test("stops reporting changes once unsubscribed", async (t) => {
  await storageWith(t);
  let calls = 0;
  const unsubscribe = new SettingsStore().onChange(() => (calls += 1));
  unsubscribe();
  await local.set({ auctionSettings: [] });
  assert.equal(calls, 0);
});

const SITES = [BIDDR, "https://www.numisbids.com"];
const forEverySite = (settings) =>
  SITES.map((site) => ({ site, house: null, auction: null, settings: settings.toJSON() }));

test("migrates the settings of 0.1.0 to settings of every site", async (t) => {
  const { data } = await storageWith(t, {
    settings: GBP.toJSON(),
    exchangeRates: GBP_RATES.toJSON(),
    unrelated: 1,
  });
  assert.equal(await new SettingsStore().migrate(SITES), true);
  assert.deepEqual(await data(), {
    auctionSettings: forEverySite(GBP),
    exchangeRates: { GBP: GBP_RATES.toJSON() },
    unrelated: 1,
  });
});

test("migrates settings saved with one key per setting", async (t) => {
  const { data } = await storageWith(t, {
    "settings.auctionPremium": 20,
    "settings.shipment": 15,
    "settings.currency": "GBP",
    "settings.exchangeRates": GBP_RATES.toJSON(),
    unrelated: 1,
  });
  assert.equal(await new SettingsStore().migrate(SITES), true);
  assert.deepEqual(await data(), {
    auctionSettings: forEverySite(GBP),
    exchangeRates: { GBP: GBP_RATES.toJSON() },
    unrelated: 1,
  });
});

test("migration keeps settings already saved per auction", async (t) => {
  const saved = [{ ...AUCTION.toJSON(), settings: CHF.toJSON() }];
  const { data } = await storageWith(t, {
    auctionSettings: saved,
    settings: GBP.toJSON(),
    "settings.shipment": 99,
  });
  assert.equal(await new SettingsStore().migrate(SITES), true);
  assert.deepEqual(await data(), { auctionSettings: saved });
});

test("migration does nothing in the current layout", async (t) => {
  const { writes } = await storageWith(t, {
    auctionSettings: [{ ...AUCTION.toJSON(), settings: GBP.toJSON() }],
    exchangeRates: { GBP: GBP_RATES.toJSON() },
  });
  assert.equal(await new SettingsStore().migrate(SITES), false);
  assert.equal(writes.length, 0);
});
