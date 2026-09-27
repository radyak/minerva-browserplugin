import { MSG } from "../core/messages.js";
import { SITES } from "../core/sites/sites.config.js";
import { TabState } from "../core/state/TabState.js";
import { ext, getActiveTab } from "../browser/ext.js";
import { MessageBus } from "../browser/MessageBus.js";
import { SettingsStore } from "../browser/SettingsStore.js";
import { registerPanelOpener } from "../browser/side-panel.js";

/**
 * Background script / service worker: owns the toolbar button, watches tab
 * navigation and forwards sync requests. Browser specific parts are delegated
 * to ../browser.
 */

registerPanelOpener();
const bus = new MessageBus(ext);

// Settings saved by an older version: convert them once, on update.
ext.runtime.onInstalled.addListener(() => {
  new SettingsStore(ext).migrate();
});

function updateBadge(tabId, active) {
  ext.action?.setBadgeText({ tabId, text: active ? "ON" : "" });
  if (active) {
    ext.action?.setBadgeBackgroundColor({ tabId, color: "#dc3545" });
  }
}

ext.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // `url` changes on real navigations and on history.pushState alike.
  if (!changeInfo.url && changeInfo.status !== "complete") return;
  const url = changeInfo.url ?? tab?.url;
  updateBadge(tabId, SITES.isTarget(url));
  bus.sendToTab(tabId, { type: MSG.SYNC_REQUEST });
});

bus.on(MSG.STATE_CHANGED, (message, sender) => {
  if (sender.tab?.id != null) updateBadge(sender.tab.id, TabState.from(message).active);
});

bus.on(MSG.GET_ACTIVE_STATE, async () => {
  const tab = await getActiveTab();
  if (!tab) return { url: null, ...TabState.inactive().toJSON() };
  const state = await bus.sendToTab(tab.id, { type: MSG.SYNC_REQUEST });
  // No content script there (yet): judge by the URL alone.
  const fallback = new TabState({ active: SITES.isTarget(tab.url) });
  return state ?? { url: tab.url ?? null, ...fallback.toJSON() };
});
