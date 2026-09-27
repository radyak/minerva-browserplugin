import { MSG } from "../core/messages.js";
import { syncDocument } from "../core/annotator.js";
import { EXCHANGE_RATES_STORAGE_KEY, ExchangeRates } from "../core/rates/ExchangeRates.js";
import { readSettings, SETTINGS_STORAGE_KEYS } from "../core/settings.js";
import { ext, sendMessage, storageGetMany } from "../platform/browser.js";

/**
 * Content script: keeps the page in sync with the core rules.
 * All decisions live in ../core, this file only deals with page lifecycle.
 */

let lastState = null;
let settings = readSettings(undefined);
let rates = ExchangeRates.empty(settings.currency);

/** Everything the calculation reads from storage. */
const STORAGE_KEYS = [...Object.values(SETTINGS_STORAGE_KEYS), EXCHANGE_RATES_STORAGE_KEY];

async function loadSettings() {
  const stored = await storageGetMany(STORAGE_KEYS);
  settings = readSettings(stored);
  rates = ExchangeRates.fromStorage(stored[EXCHANGE_RATES_STORAGE_KEY], settings.currency);
}

function sync(reason) {
  const state = syncDocument(document, location.href, settings, rates);
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

/** Recalculate the prices in every other open tab when settings are saved. */
function watchSettings() {
  ext.storage.onChanged.addListener(async (changes, area) => {
    if (area !== "local" || !STORAGE_KEYS.some((key) => key in changes)) return;
    await loadSettings();
    sync("settings");
  });
}

async function start() {
  // Settings first, so the page never shows an amount computed without them.
  await loadSettings();

  ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== MSG.SYNC_REQUEST) return false;
    // Re-read the settings: the panel sends this right after saving them, and
    // must not depend on storage.onChanged having arrived first.
    loadSettings().then(() => sendResponse({ url: location.href, ...sync("request") }));
    return true; // keep the message channel open for the async response
  });

  // Single page apps swap the URL without reloading; the background script
  // notices and sends SYNC_REQUEST, these two cover the in-page cases.
  window.addEventListener("popstate", () => sync("popstate"));
  window.addEventListener("hashchange", () => sync("hashchange"));

  watchSettings();
  sync("load");
  observeDom();
}

start();
