import assert from "node:assert/strict";
import { test } from "vitest";

import { BackgroundController } from "../src/background/BackgroundController.ts";
import { MSG } from "../src/core/messages.ts";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.ts";
import { defineSite } from "../src/core/sites/sites.ts";
import { fakeBus } from "./support/fakes.ts";

const SITES = [
  defineSite({ origin: "https://shop.test", paths: ["/lot/*"], priceSelectors: [".price"] }),
];

type Listener = (...args: any[]) => any;

/** The parts of the extension API the controller uses, recording badges and listeners. */
function fakeExt() {
  const ext = {
    badges: [] as any[],
    colors: [] as any[],
    onUpdated: [] as Listener[],
    onInstalled: [] as Listener[],
    onStartup: [] as Listener[],
    onAlarm: [] as Listener[],
    /** scheduled alarms by name */
    scheduled: new Map<string, any>(),
    alarms: {
      get: async (name) => (ext.scheduled.has(name) ? { name } : undefined),
      create: async (name, info) => {
        ext.scheduled.set(name, info);
      },
      onAlarm: { addListener: (listener) => ext.onAlarm.push(listener) },
    },
    action: {
      setBadgeText: (badge) => ext.badges.push(badge),
      setBadgeBackgroundColor: (color) => ext.colors.push(color),
    },
    tabs: {
      onUpdated: { addListener: (listener) => ext.onUpdated.push(listener) },
    },
    runtime: {
      onInstalled: { addListener: (listener) => ext.onInstalled.push(listener) },
      onStartup: { addListener: (listener) => ext.onStartup.push(listener) },
    },
  };
  return ext;
}

/** A RatesService that records its calls; `get()` fails for "CHF". */
function fakeRates() {
  return {
    refreshes: 0,
    async get(base) {
      if (base === "CHF") throw new Error("offline");
      return new ExchangeRates(base, "2026-09-25", { EUR: 1.1 });
    },
    async refreshSaved() {
      this.refreshes += 1;
      return [] as string[];
    },
  };
}

function start() {
  const ext = fakeExt();
  const bus = fakeBus();
  const rates = fakeRates();
  const migrations: string[] = [];
  const store = {
    migrate: async () => {
      migrations.push("migrated");
      return true;
    },
  };
  new BackgroundController({ ext: ext as any, bus, store, rates, sites: SITES }).start();
  return { ext, bus, rates, migrations };
}

test("marks the badge and asks the tab to sync on navigation", () => {
  const { ext, bus } = start();
  const [onUpdated] = ext.onUpdated;
  onUpdated(1, { url: "https://shop.test/lot/1" }, {});
  onUpdated(2, { status: "complete" }, { url: "https://other.test/" });
  onUpdated(3, { status: "loading" }, { url: "https://shop.test/lot/1" });
  assert.deepEqual(ext.badges, [
    { tabId: 1, text: "ON" },
    { tabId: 2, text: "" },
  ]);
  assert.deepEqual(ext.colors, [{ tabId: 1, color: "#dc3545" }]);
  assert.deepEqual(bus.sentToTabs, [
    [1, { type: MSG.SYNC_REQUEST }],
    [2, { type: MSG.SYNC_REQUEST }],
  ]);
});

test("updates the badge from the state a content script reports", () => {
  const { ext, bus } = start();
  bus.deliver({ type: MSG.STATE_CHANGED, active: true }, { tab: { id: 4 } });
  bus.deliver({ type: MSG.STATE_CHANGED, active: false }, { tab: { id: 5 } });
  // Not from a tab (e.g. the panel): ignored.
  bus.deliver({ type: MSG.STATE_CHANGED, active: true }, {});
  assert.deepEqual(ext.badges, [
    { tabId: 4, text: "ON" },
    { tabId: 5, text: "" },
  ]);
});

test("on install or update: migrates, schedules the daily refresh and refreshes the rates", async () => {
  const { ext, rates, migrations } = start();
  await ext.onInstalled[0]({ reason: "update" });
  assert.deepEqual(migrations, ["migrated"]);
  assert.deepEqual([...ext.scheduled.keys()], ["refresh-exchange-rates"]);
  assert.equal(rates.refreshes, 1);
});

test("on browser start: re-schedules the refresh only when missing and refreshes the rates", async () => {
  const { ext, rates } = start();
  await ext.onStartup[0]();
  const scheduled = ext.scheduled.get("refresh-exchange-rates");
  assert.deepEqual(scheduled, { delayInMinutes: 1440, periodInMinutes: 1440 });
  await ext.onStartup[0]();
  // Not re-created, so the running period is kept.
  assert.equal(ext.scheduled.get("refresh-exchange-rates"), scheduled);
  assert.equal(rates.refreshes, 2);
});

test("refreshes the saved rates when the alarm fires", () => {
  const { ext, rates } = start();
  ext.onAlarm[0]({ name: "refresh-exchange-rates" });
  ext.onAlarm[0]({ name: "something-else" });
  assert.equal(rates.refreshes, 1);
});

test("answers the panel's rate requests with plain data or an error", async () => {
  const { bus } = start();
  assert.deepEqual(await bus.deliver({ type: MSG.GET_RATES, base: "GBP" }), {
    rates: { base: "GBP", date: "2026-09-25", rates: { EUR: 1.1 } },
  });
  assert.deepEqual(await bus.deliver({ type: MSG.GET_RATES, base: "CHF" }), { error: "offline" });
  assert.deepEqual(await bus.deliver({ type: MSG.GET_RATES, base: "JPY" }), {
    error: "Unsupported currency: JPY",
  });
});
