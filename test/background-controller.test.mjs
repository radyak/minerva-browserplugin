import assert from "node:assert/strict";
import test from "node:test";

import { BackgroundController } from "../src/background/BackgroundController.js";
import { MSG } from "../src/core/messages.js";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.js";
import { AuctionSite } from "../src/core/sites/AuctionSite.js";
import { SiteRegistry } from "../src/core/sites/SiteRegistry.js";
import { fakeBus } from "./support/fakes.mjs";

const SITES = new SiteRegistry([
  new AuctionSite({ origin: "https://shop.test", paths: ["/lot/*"], priceSelectors: [".price"] }),
]);

/** The parts of the extension API the controller uses, recording badges and listeners. */
function fakeExt({ activeTab } = /** @type {{activeTab?: any}} */ ({})) {
  const ext = {
    badges: /** @type {any[]} */ ([]),
    colors: /** @type {any[]} */ ([]),
    onUpdated: /** @type {Function[]} */ ([]),
    onInstalled: /** @type {Function[]} */ ([]),
    onStartup: /** @type {Function[]} */ ([]),
    onAlarm: /** @type {Function[]} */ ([]),
    /** @type {Map<string, any>} scheduled alarms by name */
    scheduled: new Map(),
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
      query: async () => (activeTab ? [activeTab] : []),
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
      return true;
    },
  };
}

function start({ activeTab = undefined, tabAnswer = undefined } = {}) {
  const ext = fakeExt({ activeTab });
  const bus = fakeBus({ answers: { tab: tabAnswer } });
  const rates = fakeRates();
  let migrations = 0;
  const store = {
    migrate: async () => {
      migrations += 1;
      return true;
    },
  };
  new BackgroundController({ ext, bus, store, rates, sites: SITES }).start();
  return { ext, bus, rates, migrations: () => migrations };
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

test("answers the active tab's state as synced by its content script", async () => {
  const answer = { url: "https://shop.test/lot/1", active: true, annotated: 2, unparsable: 1 };
  const { bus } = start({ activeTab: { id: 9, url: answer.url }, tabAnswer: answer });
  assert.deepEqual(await bus.deliver({ type: MSG.GET_ACTIVE_STATE }), answer);
  assert.deepEqual(bus.sentToTabs, [[9, { type: MSG.SYNC_REQUEST }]]);
});

test("judges by the URL when the active tab has no content script", async () => {
  const { bus } = start({ activeTab: { id: 9, url: "https://shop.test/lot/1" } });
  assert.deepEqual(await bus.deliver({ type: MSG.GET_ACTIVE_STATE }), {
    url: "https://shop.test/lot/1",
    active: true,
    annotated: 0,
    unparsable: 0,
  });
});

test("is inactive without an active tab", async () => {
  const { bus } = start();
  assert.deepEqual(await bus.deliver({ type: MSG.GET_ACTIVE_STATE }), {
    url: null,
    active: false,
    annotated: 0,
    unparsable: 0,
  });
});

test("on install or update: migrates, schedules the daily refresh and refreshes the rates", async () => {
  const { ext, rates, migrations } = start();
  await ext.onInstalled[0]({ reason: "update" });
  assert.equal(migrations(), 1);
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
