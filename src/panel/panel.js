import { MSG } from "../core/messages.js";
import { ext, sendMessage, storageGet, storageSet } from "../platform/browser.js";

/** Side panel (Chrome) / sidebar (Firefox) UI. Identical on both browsers. */

const input = document.querySelector("#note");
const status = document.querySelector("#status");

/** Key used for the side panel draft text in browser.storage.local. */
export const STORAGE_KEY_PANEL_INPUT = "panel.inputValue";

function renderStatus(state) {
  const active = Boolean(state?.active);
  const count = state?.annotated ?? 0;
  const unparsable = state?.unparsable ?? 0;
  const label = `${count} price${count === 1 ? "" : "s"} updated`;
  status.textContent = active ? (unparsable ? `${label}, ${unparsable} n/a` : label) : "inactive";
  status.className = `badge ${active ? "text-bg-danger" : "text-bg-secondary"}`;
}

async function refreshStatus() {
  renderStatus(await sendMessage({ type: MSG.GET_ACTIVE_STATE }));
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

const persist = debounce((value) => storageSet(STORAGE_KEY_PANEL_INPUT, value), 250);

input.addEventListener("input", (event) => persist(event.target.value));

storageGet(STORAGE_KEY_PANEL_INPUT, "").then((value) => {
  input.value = value;
});

// Keep the status in sync: the content script pushes changes, tab switches and
// navigations are picked up from the tabs API.
ext.runtime.onMessage.addListener((message) => {
  // Re-query instead of trusting the message: it may come from a background tab.
  if (message?.type === MSG.STATE_CHANGED) refreshStatus();
  return false;
});
ext.tabs.onActivated.addListener(refreshStatus);
ext.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") refreshStatus();
});

refreshStatus();
