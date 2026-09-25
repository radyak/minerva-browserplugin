import { MSG } from "../core/messages.js";
import { fetchExchangeRates } from "../core/exchange-rates.js";
import { readSettings, SETTINGS_STORAGE_KEYS } from "../core/settings.js";
import { ext, sendMessage, storageGetMany, storageSet } from "../platform/browser.js";

/** Side panel (Chrome) / sidebar (Firefox) UI. Identical on both browsers. */

const status = document.querySelector("#status");
const form = document.querySelector("#settings");
const saved = document.querySelector("#saved");
const currency = document.querySelector("#currency");
const shipmentCurrency = document.querySelector("#shipment-currency");
const ratesBody = document.querySelector("#rates");
const ratesInfo = document.querySelector("#rates-info");

/** The numeric input of every setting; the content script picks the stored values up. */
const inputs = {
  auctionPremium: document.querySelector("#auction-premium"),
  shipment: document.querySelector("#shipment"),
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

/** Show the rates of `rates.base` against the other currencies. */
function renderRates({ base, date, rates }) {
  ratesBody.replaceChildren(
    ...Object.entries(rates).map(([code, rate]) => {
      const row = document.createElement("tr");
      const pair = document.createElement("td");
      const value = document.createElement("td");
      pair.textContent = `1 ${base} =`;
      value.textContent = `${rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${code}`;
      value.className = "text-end";
      row.append(pair, value);
      return row;
    }),
  );
  ratesInfo.textContent = `ECB reference rates of ${date}`;
  ratesInfo.classList.remove("text-danger");
}

let ratesRequest = 0;
/** Load and show the rates of `base`; only the latest request is rendered. */
async function loadRates(base) {
  const request = ++ratesRequest;
  ratesBody.replaceChildren();
  ratesInfo.textContent = "Loading…";
  ratesInfo.classList.remove("text-danger");
  try {
    const rates = await fetchExchangeRates(base);
    if (request === ratesRequest) renderRates(rates);
  } catch {
    if (request !== ratesRequest) return;
    ratesInfo.textContent = "Exchange rates unavailable.";
    ratesInfo.classList.add("text-danger");
  }
}

/** Follow a (new) currency: shipment hint and exchange rates. */
function applyCurrency() {
  shipmentCurrency.textContent = currency.value;
  loadRates(currency.value);
}

currency.addEventListener("change", applyCurrency);

/** Put the stored value into every input that is empty. */
async function fillEmptyInputs() {
  const stored = await storageGetMany(Object.values(SETTINGS_STORAGE_KEYS));
  for (const [name, input] of Object.entries(inputs)) {
    const value = stored[SETTINGS_STORAGE_KEYS[name]];
    if (input.value === "" && value != null && value !== "") input.value = String(value);
  }
}

/** Flag invalid inputs; true when every input may be saved. */
function validate() {
  let valid = true;
  for (const input of Object.values(inputs)) {
    const ok = input.checkValidity();
    input.classList.toggle("is-invalid", !ok);
    valid &&= ok;
  }
  return valid;
}

let savedTimer;
function showSaved() {
  saved.hidden = false;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => {
    saved.hidden = true;
  }, 2000);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validate()) return;

  // Empty inputs are skipped, so they keep the stored value.
  await Promise.all([
    ...Object.entries(inputs)
      .filter(([, input]) => input.value !== "")
      .map(([name, input]) => storageSet(SETTINGS_STORAGE_KEYS[name], input.valueAsNumber)),
    storageSet(SETTINGS_STORAGE_KEYS.currency, currency.value),
  ]);
  await fillEmptyInputs();
  // Asking for the state makes the active tab re-read the settings and recalculate.
  await refreshStatus();
  showSaved();
});

for (const input of Object.values(inputs)) {
  input.addEventListener("input", () => input.classList.remove("is-invalid"));
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

/** Select the stored currency (or the default) before anything is loaded. */
async function selectStoredCurrency() {
  const stored = await storageGetMany([SETTINGS_STORAGE_KEYS.currency]);
  currency.value = readSettings(stored).currency;
  applyCurrency();
}

// Show what is stored, then bring the active tab in line with it.
selectStoredCurrency();
fillEmptyInputs().then(refreshStatus);
