import { Currency } from "../core/currency/Currency.js";
import { MSG } from "../core/messages.js";
import { RatesClient } from "../core/rates/RatesClient.js";
import { Settings } from "../core/settings/Settings.js";
import { TabState } from "../core/state/TabState.js";
import { ext } from "../browser/ext.js";
import { MessageBus } from "../browser/MessageBus.js";
import { SettingsStore } from "../browser/SettingsStore.js";

/** Side panel (Chrome) / sidebar (Firefox) UI. Identical on both browsers. */

const bus = new MessageBus(ext);
const store = new SettingsStore(ext);

const status = document.querySelector("#status");
const form = document.querySelector("#settings");
const saved = /** @type {HTMLElement} */ (document.querySelector("#saved"));
const currency = /** @type {HTMLSelectElement} */ (document.querySelector("#currency"));
const shipmentCurrency = document.querySelector("#shipment-currency");
const ratesBody = document.querySelector("#rates");
const ratesInfo = document.querySelector("#rates-info");

/** The numeric input of every setting; the content script picks the stored values up. */
const inputs = /** @type {Record<"auctionPremium" | "shipment", HTMLInputElement>} */ ({
  auctionPremium: document.querySelector("#auction-premium"),
  shipment: document.querySelector("#shipment"),
});

// The accepted ranges come from Settings, so the input validation matches what is read back.
for (const [name, input] of Object.entries(inputs)) {
  const { min, max } = Settings.RANGES[name];
  input.min = String(min);
  if (Number.isFinite(max)) input.max = String(max);
}

/** @param {TabState} state */
function renderStatus({ active, annotated: count, unparsable }) {
  const label = `${count} price${count === 1 ? "" : "s"} updated`;
  status.textContent = active ? (unparsable ? `${label}, ${unparsable} n/a` : label) : "inactive";
  status.className = `badge ${active ? "text-bg-danger" : "text-bg-secondary"}`;
}

async function refreshStatus() {
  renderStatus(TabState.from(await bus.send({ type: MSG.GET_ACTIVE_STATE })));
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

const ratesClient = new RatesClient();
let ratesRequest = 0;
/**
 * Load and show the rates of `base`; only the latest request is rendered.
 * @returns {Promise<import("../core/rates/ExchangeRates.js").ExchangeRates | null>}
 */
async function loadRates(base) {
  const request = ++ratesRequest;
  ratesBody.replaceChildren();
  ratesInfo.textContent = "Loading…";
  ratesInfo.classList.remove("text-danger");
  try {
    const rates = await ratesClient.fetch(base);
    if (request === ratesRequest) renderRates(rates);
    return rates;
  } catch {
    if (request === ratesRequest) {
      ratesInfo.textContent = "Exchange rates unavailable.";
      ratesInfo.classList.add("text-danger");
    }
    return null;
  }
}

/** Rates of the currently selected currency, once loaded (null on failure). */
let selectedRates = Promise.resolve(null);

/** Follow a (new) currency: shipment hint and exchange rates. */
function applyCurrency() {
  shipmentCurrency.textContent = currency.value;
  selectedRates = loadRates(currency.value);
}

/**
 * The loaded rates of `code` - null when loading failed or they belong to
 * another currency. The stored rates then stay (and are ignored by the page
 * if they no longer match the saved currency).
 * @param {string} code
 */
async function ratesFor(code) {
  const rates = await selectedRates;
  return rates?.base === code ? rates : null;
}

currency.replaceChildren(...Currency.CODES.map((code) => new Option(code, code)));
currency.addEventListener("change", applyCurrency);

/**
 * Show `settings` in the form.
 * @param {Settings} settings
 */
function showSettings(settings) {
  currency.value = settings.currency;
  for (const [name, input] of Object.entries(inputs)) input.value = String(settings[name]);
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

  // An emptied input keeps the current value.
  const { settings: current } = await store.load();
  /** @param {"auctionPremium" | "shipment"} name */
  const value = (name) => (inputs[name].value === "" ? current[name] : inputs[name].valueAsNumber);
  const settings = Settings.from({
    auctionPremium: value("auctionPremium"),
    shipment: value("shipment"),
    currency: currency.value,
  });
  // Settings and matching rates in one write: open tabs never see one without the other.
  await store.save(settings, (await ratesFor(settings.currency)) ?? undefined);
  showSettings(settings);
  // Asking for the state makes the active tab re-read the settings and recalculate.
  await refreshStatus();
  showSaved();
});

for (const input of Object.values(inputs)) {
  input.addEventListener("input", () => input.classList.remove("is-invalid"));
}

// Keep the status in sync: the content script pushes changes, tab switches and
// navigations are picked up from the tabs API.
bus.on(MSG.STATE_CHANGED, () => {
  // Re-query instead of trusting the message: it may come from a background tab.
  refreshStatus();
});
ext.tabs.onActivated.addListener(refreshStatus);
ext.tabs.onUpdated.addListener((_tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "complete") refreshStatus();
});

/**
 * Show the saved settings and refresh the saved rates with the ones just
 * loaded for their currency; open tabs recalculate via storage.onChanged.
 */
async function showStoredSettings() {
  const { settings } = await store.load();
  showSettings(settings);
  applyCurrency();
  const rates = await ratesFor(settings.currency);
  if (rates) await store.saveRates(rates);
}

// Show what is stored, then bring the active tab in line with it.
showStoredSettings().then(refreshStatus);
