import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { fakeBrowser } from "wxt/testing/fake-browser";

import { SettingsStore, type Migration } from "../src/browser/SettingsStore.ts";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.ts";
import { AuctionKey } from "../src/core/settings/AuctionKey.ts";
import { Settings } from "../src/core/settings/Settings.ts";

// WxtVitest() (vitest.config.ts) puts WXT's in-memory fakeBrowser in place of
// the extension API, which SettingsStore's wxt/utils/storage binds to.
const local = fakeBrowser.storage.local;

/** Start with exactly `initial` in storage.local; records every write from then on. */
async function storageWith(initial = {}) {
  fakeBrowser.reset();
  await local.set(initial);
  const writes: unknown[] = [];
  const set = local.set.bind(local);
  vi.spyOn(local, "set").mockImplementation((items) => {
    writes.push(structuredClone(items));
    return set(items);
  });
  return { writes, data: async () => (await local.get()) as Record<string, any> };
}

const GBP = new Settings({ auctionPremium: 20, shipment: 15, currency: "GBP" });
const CHF = new Settings({ auctionPremium: 18, shipment: 30, currency: "CHF" });
const GBP_RATES = new ExchangeRates("GBP", "2026-09-25", { EUR: 1.16, USD: 1.32 });
const CHF_RATES = new ExchangeRates("CHF", "2026-09-25", { EUR: 1.07 });
const BIDDR = "https://www.biddr.com";
const AUCTION = AuctionKey.from({ site: BIDDR, house: "leu", auction: "7" });
const SITE = AuctionKey.from({ site: BIDDR });

test("loads an empty book and no rates when nothing is saved", async () => {
  await storageWith();
  const { book, rates } = await new SettingsStore().load();
  assert.deepEqual(book.entries, []);
  assert.deepEqual(rates, {});
});

test("saves settings and their rates in one write and loads them back", async () => {
  const { writes, data } = await storageWith();
  const store = new SettingsStore();
  await store.save(AUCTION, GBP, GBP_RATES);
  assert.equal(writes.length, 1);
  assert.deepEqual(await data(), {
    auctionSettings: [{ site: BIDDR, house: "leu", auction: "7", settings: GBP.toJSON() }],
    exchangeRates: { GBP: GBP_RATES.toJSON() },
    storageVersion: 1,
  });
  const { book, rates } = await store.load();
  assert.deepEqual(book.resolve(AUCTION)?.settings, GBP);
  assert.deepEqual(rates, { GBP: GBP_RATES });
});

test("keeps the settings of other auctions and the rates of other currencies", async () => {
  const { data } = await storageWith();
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

test("ignores rates saved under another currency than their base", async () => {
  await storageWith({ exchangeRates: { EUR: GBP_RATES.toJSON(), GBP: GBP_RATES.toJSON() } });
  const { rates } = await new SettingsStore().load();
  assert.deepEqual(rates, { GBP: GBP_RATES });
});

test("reads malformed stored data as nothing saved", async () => {
  await storageWith({ auctionSettings: "broken", exchangeRates: 42 });
  const { book, rates } = await new SettingsStore().load();
  assert.deepEqual(book.entries, []);
  assert.deepEqual(rates, {});
});

test("reports changes of its own keys in local storage only", async () => {
  await storageWith();
  let calls = 0;
  new SettingsStore().onChange(() => (calls += 1));
  await local.set({ auctionSettings: [] });
  await local.set({ exchangeRates: { GBP: GBP_RATES.toJSON() } });
  await local.set({ unrelated: 1 });
  await fakeBrowser.storage.sync.set({ auctionSettings: [{ site: BIDDR }] });
  assert.equal(calls, 2);
});

test("a save is one change event; every notification sees settings and rates together", async () => {
  await storageWith();
  const store = new SettingsStore();
  let events = 0;
  local.onChanged.addListener(() => (events += 1));
  const seen: Array<ReturnType<SettingsStore["load"]>> = [];
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

test("stops reporting changes once unsubscribed", async () => {
  await storageWith();
  let calls = 0;
  const unsubscribe = new SettingsStore().onChange(() => (calls += 1));
  unsubscribe();
  await local.set({ auctionSettings: [] });
  assert.equal(calls, 0);
});

test("records the layout version on install, once", async () => {
  const { writes, data } = await storageWith();
  const store = new SettingsStore();
  assert.equal(await store.migrate(), false);
  assert.deepEqual(await data(), { storageVersion: 1 });
  assert.equal(await store.migrate(), false);
  assert.equal(writes.length, 1);
});

/** A layout version 2 that renames `shipment` to `shipping` in every entry. */
const RENAMED = {
  version: 2,
  migrations: {
    2: (({ auctionSettings, exchangeRates }) => ({
      auctionSettings: (auctionSettings as any[]).map(
        ({ settings: { shipping, ...settings }, ...key }) => ({
          ...key,
          settings: { ...settings, shipment: shipping },
        }),
      ),
      exchangeRates,
    })) satisfies Migration,
  },
};
const V1_ENTRY = {
  ...AUCTION,
  settings: { auctionPremium: 20, shipping: 15, currency: "GBP" },
};

test("converts data of an older layout on reading, before it is migrated", async () => {
  await storageWith({ auctionSettings: [V1_ENTRY] });
  const { book } = await new SettingsStore(RENAMED).load();
  assert.deepEqual(book.resolve(AUCTION)?.settings, GBP);
});

test("migrates data of an older layout in one write and records the new version", async () => {
  const { writes, data } = await storageWith({
    auctionSettings: [V1_ENTRY],
    exchangeRates: { GBP: GBP_RATES.toJSON() },
    storageVersion: 1,
  });
  const store = new SettingsStore(RENAMED);
  assert.equal(await store.migrate(), true);
  assert.equal(writes.length, 1);
  assert.deepEqual(await data(), {
    auctionSettings: [
      { ...AUCTION, settings: { auctionPremium: 20, shipment: 15, currency: "GBP" } },
    ],
    exchangeRates: { GBP: GBP_RATES.toJSON() },
    storageVersion: 2,
  });
  assert.equal(await store.migrate(), false);
});

test("a save writes the current layout version", async () => {
  const { data } = await storageWith({ auctionSettings: [V1_ENTRY] });
  await new SettingsStore(RENAMED).save(SITE, CHF);
  const saved = await data();
  assert.equal(saved.storageVersion, 2);
  assert.deepEqual(saved.auctionSettings, [
    { ...AUCTION, settings: GBP.toJSON() },
    { ...SITE, settings: CHF.toJSON() },
  ]);
});
