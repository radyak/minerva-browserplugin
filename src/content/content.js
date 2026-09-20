import { MSG } from "../core/messages.js";
import { syncDocument } from "../core/annotator.js";
import { ext, sendMessage } from "../platform/browser.js";

/**
 * Content script: keeps the page in sync with the core rules.
 * All decisions live in ../core, this file only deals with page lifecycle.
 */

let lastState = null;

function sync(reason) {
  const state = syncDocument(document, location.href);
  const changed =
    !lastState ||
    lastState.active !== state.active ||
    lastState.annotated !== state.annotated ||
    lastState.unparsable !== state.unparsable;
  lastState = state;
  if (changed) {
    sendMessage({ type: MSG.STATE_CHANGED, url: location.href, ...state, reason });
  }
  return state;
}

/**
 * Re-run after DOM changes - the price element may be rendered late or have its
 * text replaced by the page's own JavaScript. `characterData` is what catches a
 * price that changes in place. Coalesced into one run per animation frame; the
 * annotator only writes on a real change, so our own updates settle after one
 * extra pass instead of looping.
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
  observer.observe(document.documentElement, {
    childList: true,
    characterData: true,
    subtree: true,
  });
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
