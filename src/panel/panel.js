import { MSG } from "../core/messages.js";
import { ext, sendMessage, storageGet, storageSet } from "../platform/browser.js";

/** Side panel (Chrome) / sidebar (Firefox) UI. Identical on both browsers. */

const status = document.querySelector("#status");

/** Keys used for the side panel inputs in browser.storage.local, by input id. */
export const STORAGE_KEYS = {
  "auction-premium": "panel.auctionPremium",
  shipment: "panel.shipment",
};

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

// Each input is persisted on its own; out-of-range values are flagged and not stored.
for (const [id, key] of Object.entries(STORAGE_KEYS)) {
  const input = document.getElementById(id);
  const persist = debounce((value) => storageSet(key, value), 250);

  input.addEventListener("input", () => {
    const valid = input.checkValidity();
    input.classList.toggle("is-invalid", !valid);
    if (valid) persist(input.value);
  });

  storageGet(key, "").then((value) => {
    input.value = value;
  });
}

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
