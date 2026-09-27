import assert from "node:assert/strict";
import test from "node:test";

import { BackgroundController } from "../src/background/BackgroundController.js";
import { MSG } from "../src/core/messages.js";
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
    action: {
      setBadgeText: (badge) => ext.badges.push(badge),
      setBadgeBackgroundColor: (color) => ext.colors.push(color),
    },
    tabs: {
      onUpdated: { addListener: (listener) => ext.onUpdated.push(listener) },
      query: async () => (activeTab ? [activeTab] : []),
    },
    runtime: { onInstalled: { addListener: (listener) => ext.onInstalled.push(listener) } },
  };
  return ext;
}

function start({ activeTab = undefined, tabAnswer = undefined } = {}) {
  const ext = fakeExt({ activeTab });
  const bus = fakeBus({ answers: { tab: tabAnswer } });
  let migrations = 0;
  const store = {
    migrate: async () => {
      migrations += 1;
      return true;
    },
  };
  new BackgroundController({ ext, bus, store, sites: SITES }).start();
  return { ext, bus, migrations: () => migrations };
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

test("migrates old settings on install or update", () => {
  const { ext, migrations } = start();
  ext.onInstalled[0]({ reason: "update" });
  assert.equal(migrations(), 1);
});
