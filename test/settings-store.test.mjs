import assert from "node:assert/strict";
import test from "node:test";

import { SettingsStore } from "../src/browser/SettingsStore.js";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.js";
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
const GBP_RATES = new ExchangeRates("GBP", "2026-09-25", { EUR: 1.16, USD: 1.32 });

test("loads defaults and empty rates when nothing is saved", async () => {
  const { settings, rates } = await new SettingsStore(fakeExt()).load();
  assert.deepEqual(settings, Settings.DEFAULT);
  assert.deepEqual(rates, ExchangeRates.empty(Settings.DEFAULT.currency));
});

test("saves settings and rates in one write and loads them back", async () => {
  const ext = fakeExt();
  const store = new SettingsStore(ext);
  await store.save(GBP, GBP_RATES);
  assert.equal(ext.writes.length, 1);
  assert.deepEqual(ext.data, { settings: GBP.toJSON(), exchangeRates: GBP_RATES.toJSON() });
  assert.deepEqual(await store.load(), { settings: GBP, rates: GBP_RATES });
});

test("keeps the saved rates when saving settings without rates", async () => {
  const ext = fakeExt({ exchangeRates: GBP_RATES.toJSON() });
  const store = new SettingsStore(ext);
  await store.save(GBP);
  assert.deepEqual(ext.data.exchangeRates, GBP_RATES.toJSON());
  await store.saveRates(ExchangeRates.empty("GBP"));
  assert.deepEqual(ext.data.settings, GBP.toJSON());
});

test("ignores rates saved for another currency", async () => {
  const ext = fakeExt({
    settings: GBP.toJSON(),
    exchangeRates: { base: "EUR", rates: { GBP: 0.86 } },
  });
  const { rates } = await new SettingsStore(ext).load();
  assert.deepEqual(rates, ExchangeRates.empty("GBP"));
});

test("reports changes of its own keys in local storage only", () => {
  const ext = fakeExt();
  let calls = 0;
  new SettingsStore(ext).onChange(() => (calls += 1));
  const [listener] = ext.listeners;
  listener({ settings: {} }, "local");
  listener({ exchangeRates: {} }, "local");
  listener({ unrelated: {} }, "local");
  listener({ settings: {} }, "sync");
  assert.equal(calls, 2);
});

test("migrates settings saved with one key per setting", async () => {
  const ext = fakeExt({
    "settings.auctionPremium": 20,
    "settings.shipment": 15,
    "settings.currency": "GBP",
    "settings.exchangeRates": GBP_RATES.toJSON(),
    unrelated: 1,
  });
  assert.equal(await new SettingsStore(ext).migrate(), true);
  assert.deepEqual(ext.data, {
    settings: GBP.toJSON(),
    exchangeRates: GBP_RATES.toJSON(),
    unrelated: 1,
  });
});

test("migration keeps settings already saved in the current layout", async () => {
  const ext = fakeExt({ settings: GBP.toJSON(), "settings.shipment": 99 });
  assert.equal(await new SettingsStore(ext).migrate(), true);
  assert.deepEqual(ext.data, { settings: GBP.toJSON() });
});

test("migration does nothing without old keys", async () => {
  const ext = fakeExt({ settings: GBP.toJSON() });
  assert.equal(await new SettingsStore(ext).migrate(), false);
  assert.equal(ext.writes.length, 0);
});
