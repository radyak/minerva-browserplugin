import { MSG } from "../core/messages.js";
import { syncDocument } from "../core/marker.js";
import { ext, sendMessage } from "../platform/browser.js";

/**
 * Content script: keeps the page in sync with the core rules.
 * All decisions live in ../core, this file only deals with page lifecycle.
 */

let lastState = null;

function sync(reason) {
  const state = syncDocument(document, location.href);
  const changed =
    !lastState || lastState.active !== state.active || lastState.marked !== state.marked;
  lastState = state;
  if (changed) {
    sendMessage({ type: MSG.STATE_CHANGED, url: location.href, ...state, reason });
  }
  return state;
}

/**
 * Re-run after DOM changes - the target element may be rendered late by the
 * page's own JavaScript. Coalesced into one run per animation frame.
 */
function observeDom() {
  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      sync("mutation");
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== MSG.SYNC_REQUEST) return false;
  sendResponse({ url: location.href, ...sync("request") });
  return true;
});

// Single page apps swap the URL without reloading; the background script
// notices and sends SYNC_REQUEST, these two cover the in-page cases.
window.addEventListener("popstate", () => sync("popstate"));
window.addEventListener("hashchange", () => sync("hashchange"));

sync("load");
observeDom();
