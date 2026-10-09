import assert from "node:assert/strict";
import test from "node:test";

import { SettingsStore } from "../src/browser/SettingsStore.js";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.js";
import { AuctionKey } from "../src/core/settings/AuctionKey.js";
import { Settings } from "../src/core/settings/Settings.js";

/** An in-memory storage.local that records every write, plus its onChanged listeners. */
function fakeExt(initial = {}) {
  const data = structuredClone(initial);
  const ext = {
    data,
    writes: [],
    listeners: [],
    storage: {
      local: {
        get: async (keys) =>
          Object.fromEntries(
            [keys]
              .flat()
              .filter((k) => k in data)
              .map((k) => [k, data[k]]),
          ),
        set: async (items) => {
          ext.writes.push(structuredClone(items));
          Object.assign(data, structuredClone(items));
        },
        remove: async (keys) => {
          for (const key of [keys].flat()) delete data[key];
        },
      },
      onChanged: { addListener: (listener) => ext.listeners.push(listener) },
    },
  };
  return ext;
}

const GBP = new Settings({ auctionPremium: 20, shipment: 15, currency: "GBP" });
const CHF = new Settings({ auctionPremium: 18, shipment: 30, currency: "CHF" });
const GBP_RATES = new ExchangeRates("GBP", "2026-09-25", { EUR: 1.16, USD: 1.32 });
const CHF_RATES = new ExchangeRates("CHF", "2026-09-25", { EUR: 1.07 });
const BIDDR = "https://www.biddr.com";
const AUCTION = new AuctionKey({ site: BIDDR, house: "leu", auction: "7" });
const SITE = new AuctionKey({ site: BIDDR });

test("loads an empty book and no rates when nothing is saved", async () => {
  const { book, rates } = await new SettingsStore(fakeExt()).load();
  assert.deepEqual(book.entries, []);
  assert.deepEqual(rates, {});
});

test("saves settings and their rates in one write and loads them back", async () => {
  const ext = fakeExt();
  const store = new SettingsStore(ext);
  await store.save(AUCTION, GBP, GBP_RATES);
  assert.equal(ext.writes.length, 1);
  assert.deepEqual(ext.data, {
    auctionSettings: [{ site: BIDDR, house: "leu", auction: "7", settings: GBP.toJSON() }],
    exchangeRates: { GBP: GBP_RATES.toJSON() },
  });
  const { book, rates } = await store.load();
  assert.deepEqual(book.resolve(AUCTION)?.settings, GBP);
  assert.deepEqual(rates, { GBP: GBP_RATES });
});

test("keeps the settings of other auctions and the rates of other currencies", async () => {
  const ext = fakeExt();
  const store = new SettingsStore(ext);
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
  assert.deepEqual(ext.data.exchangeRates.GBP, GBP_RATES.toJSON());
  assert.equal(ext.data.auctionSettings.length, 2);
});

test("ignores rates saved under another currency than their base", async () => {
  const ext = fakeExt({ exchangeRates: { EUR: GBP_RATES.toJSON(), GBP: GBP_RATES.toJSON() } });
  const { rates } = await new SettingsStore(ext).load();
  assert.deepEqual(rates, { GBP: GBP_RATES });
});

test("reports changes of its own keys in local storage only", () => {
  const ext = fakeExt();
  let calls = 0;
  new SettingsStore(ext).onChange(() => (calls += 1));
  const [listener] = ext.listeners;
  listener({ auctionSettings: {} }, "local");
  listener({ exchangeRates: {} }, "local");
  listener({ unrelated: {} }, "local");
  listener({ auctionSettings: {} }, "sync");
  assert.equal(calls, 2);
});

const SITES = [BIDDR, "https://www.numisbids.com"];
const forEverySite = (settings) =>
  SITES.map((site) => ({ site, house: null, auction: null, settings: settings.toJSON() }));

test("migrates the settings of 0.1.0 to settings of every site", async () => {
  const ext = fakeExt({ settings: GBP.toJSON(), exchangeRates: GBP_RATES.toJSON(), unrelated: 1 });
  assert.equal(await new SettingsStore(ext).migrate(SITES), true);
  assert.deepEqual(ext.data, {
    auctionSettings: forEverySite(GBP),
    exchangeRates: { GBP: GBP_RATES.toJSON() },
    unrelated: 1,
  });
});

test("migrates settings saved with one key per setting", async () => {
  const ext = fakeExt({
    "settings.auctionPremium": 20,
    "settings.shipment": 15,
    "settings.currency": "GBP",
    "settings.exchangeRates": GBP_RATES.toJSON(),
    unrelated: 1,
  });
  assert.equal(await new SettingsStore(ext).migrate(SITES), true);
  assert.deepEqual(ext.data, {
    auctionSettings: forEverySite(GBP),
    exchangeRates: { GBP: GBP_RATES.toJSON() },
    unrelated: 1,
  });
});

test("migration keeps settings already saved per auction", async () => {
  const saved = [{ ...AUCTION.toJSON(), settings: CHF.toJSON() }];
  const ext = fakeExt({ auctionSettings: saved, settings: GBP.toJSON(), "settings.shipment": 99 });
  assert.equal(await new SettingsStore(ext).migrate(SITES), true);
  assert.deepEqual(ext.data, { auctionSettings: saved });
});

test("migration does nothing in the current layout", async () => {
  const ext = fakeExt({
    auctionSettings: [{ ...AUCTION.toJSON(), settings: GBP.toJSON() }],
    exchangeRates: { GBP: GBP_RATES.toJSON() },
  });
  assert.equal(await new SettingsStore(ext).migrate(SITES), false);
  assert.equal(ext.writes.length, 0);
});
