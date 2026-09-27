import { MSG } from "../core/messages.js";
import { syncDocument } from "../core/annotator.js";
import { EXCHANGE_RATES_STORAGE_KEY, ExchangeRates } from "../core/rates/ExchangeRates.js";
import { Settings } from "../core/settings/Settings.js";
import { ext, storageGetMany } from "../browser/ext.js";
import { MessageBus } from "../browser/MessageBus.js";

/**
 * Content script: keeps the page in sync with the core rules.
 * All decisions live in ../core, this file only deals with page lifecycle.
 */

/** @type {import("../core/state/TabState.js").TabState | null} null until the first sync, so that one is always reported */
let lastState = null;
const bus = new MessageBus(ext);
let settings = Settings.DEFAULT;
let rates = ExchangeRates.empty(settings.currency);

/** Everything the calculation reads from storage. */
const STORAGE_KEYS = [...Object.values(Settings.STORAGE_KEYS), EXCHANGE_RATES_STORAGE_KEY];

async function loadSettings() {
  const stored = await storageGetMany(STORAGE_KEYS);
  settings = Settings.fromStorage(stored);
  rates = ExchangeRates.fromStorage(stored[EXCHANGE_RATES_STORAGE_KEY], settings.currency);
}

function sync(reason) {
  const state = syncDocument(document, location.href, settings, rates);
  const changed = !state.equals(lastState);
  lastState = state;
  if (changed) {
    bus.send({ type: MSG.STATE_CHANGED, url: location.href, ...state.toJSON(), reason });
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

  bus.on(MSG.SYNC_REQUEST, async () => {
    // Re-read the settings: the panel sends this right after saving them, and
    // must not depend on storage.onChanged having arrived first.
    await loadSettings();
    return { url: location.href, ...sync("request").toJSON() };
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
