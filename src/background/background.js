import { MSG } from "../core/messages.js";
import { isTargetUrl } from "../core/annotator.js";
import { TabState } from "../core/state/TabState.js";
import { ext, getActiveTab, sendMessageToTab } from "../platform/browser.js";
import { registerPanelOpener } from "../platform/panel.js";

/**
 * Background script / service worker: owns the toolbar button, watches tab
 * navigation and forwards sync requests. Browser specific parts are delegated
 * to ../platform.
 */

registerPanelOpener();

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
  updateBadge(tabId, isTargetUrl(url));
  sendMessageToTab(tabId, { type: MSG.SYNC_REQUEST });
});

ext.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === MSG.STATE_CHANGED && sender.tab?.id != null) {
    updateBadge(sender.tab.id, TabState.from(message).active);
    return false;
  }

  if (message?.type === MSG.GET_ACTIVE_STATE) {
    getActiveTab()
      .then(async (tab) => {
        if (!tab) return { url: null, ...TabState.inactive().toJSON() };
        const state = await sendMessageToTab(tab.id, { type: MSG.SYNC_REQUEST });
        // No content script there (yet): judge by the URL alone.
        const fallback = new TabState({ active: isTargetUrl(tab.url) });
        return state ?? { url: tab.url ?? null, ...fallback.toJSON() };
      })
      .then(sendResponse);
    return true; // keep the message channel open for the async response
  }

  return false;
});
