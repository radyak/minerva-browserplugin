import { MSG } from "../core/messages.js";
import { isTargetUrl } from "../core/marker.js";
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
    updateBadge(sender.tab.id, message.active);
    return false;
  }

  if (message?.type === MSG.GET_ACTIVE_STATE) {
    getActiveTab()
      .then(async (tab) => {
        if (!tab) return { active: false, url: null };
        const state = await sendMessageToTab(tab.id, { type: MSG.SYNC_REQUEST });
        return state ?? { active: isTargetUrl(tab.url), url: tab.url ?? null, marked: 0 };
      })
      .then(sendResponse);
    return true; // keep the message channel open for the async response
  }

  return false;
});
