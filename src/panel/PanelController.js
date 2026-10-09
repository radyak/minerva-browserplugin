import { Currency } from "../core/currency/Currency.js";
import { MSG } from "../core/messages.js";
import { ExchangeRates } from "../core/rates/ExchangeRates.js";
import { TabState } from "../core/state/TabState.js";
import { SelectedRates } from "./SelectedRates.js";
import { InactiveView } from "./views/InactiveView.js";
import { RatesView } from "./views/RatesView.js";
import { SettingsFormView } from "./views/SettingsFormView.js";
import { StatusView } from "./views/StatusView.js";

/**
 * Side panel (Chrome) / sidebar (Firefox): shows and saves the settings, what
 * the extension does in the active tab and the exchange rates from that tab's
 * price currencies into the selected currency (loaded by the background). Identical on both browsers;
 * everything it touches is passed in.
 */
export class PanelController {
  /** @type {ExchangeRates | null | undefined} rates of the selected currency; undefined while loading, null when unavailable */
  #rates;
  /** @type {TabState} */
  #state = TabState.inactive();

  /**
   * @param {object} deps
   * @param {Document} deps.document the panel document (panel.html)
   * @param {any} deps.tabs the extension `tabs` API (`onActivated`, `onUpdated`)
   * @param {Pick<import("../browser/MessageBus.js").MessageBus, "on" | "send">} deps.bus
   * @param {Pick<import("../browser/SettingsStore.js").SettingsStore, "load" | "save">} deps.store
   */
  constructor({ document, tabs, bus, store }) {
    this.tabs = tabs;
    this.bus = bus;
    this.store = store;
    this.rates = new SelectedRates((code) => this.#requestRates(code));
    this.form = new SettingsFormView(document);
    this.status = new StatusView({
      badge: /** @type {HTMLElement} */ (document.getElementById("status")),
      ids: /** @type {HTMLElement} */ (document.getElementById("auction-ids")),
      house: /** @type {HTMLElement} */ (document.getElementById("auction-house")),
      auction: /** @type {HTMLElement} */ (document.getElementById("auction-id")),
    });
    this.inactiveView = new InactiveView({
      form: /** @type {HTMLElement} */ (document.getElementById("settings")),
      notice: /** @type {HTMLElement} */ (document.getElementById("inactive")),
    });
    this.ratesView = new RatesView({
      body: /** @type {HTMLElement} */ (document.getElementById("rates")),
      info: /** @type {HTMLElement} */ (document.getElementById("rates-info")),
    });
  }

  /** Wire the UI, show what is stored, then bring the active tab in line with it. */
  async start() {
    this.form.onSubmit(() => this.save());
    this.form.onCurrencyChange((code) => this.selectCurrency(code));

    // Keep the status in sync: the content script pushes changes, tab switches and
    // navigations are picked up from the tabs API.
    this.bus.on(MSG.STATE_CHANGED, () => {
      // Re-query instead of trusting the message: it may come from a background tab.
      this.refreshStatus();
    });
    this.tabs.onActivated.addListener(() => this.refreshStatus());
    this.tabs.onUpdated.addListener((_tabId, changeInfo) => {
      if (changeInfo.url || changeInfo.status === "complete") this.refreshStatus();
    });

    await this.#showStoredSettings();
    await this.refreshStatus();
  }

  /**
   * Follow a (newly) selected currency: shipment hint and exchange rates.
   * @param {string} code
   */
  async selectCurrency(code) {
    this.form.showCurrency(code);
    this.#rates = undefined;
    this.#showRates();
    const { rates, latest } = await this.rates.load(code);
    if (!latest) return; // another currency was picked in the meantime
    this.#rates = rates;
    this.#showRates();
  }

  /** Save the entered settings with the matching rates; the active tab recalculates. */
  async save() {
    if (!this.form.validate()) return;
    const { settings: current } = await this.store.load();
    const settings = this.form.read(current);
    // Settings and matching rates in one write: open tabs never see one without the other.
    // Without matching rates the stored ones stay (and are ignored by the page).
    await this.store.save(settings, (await this.rates.ratesFor(settings.currency)) ?? undefined);
    this.form.show(settings);
    // Asking for the state makes the active tab re-read the settings and recalculate.
    await this.refreshStatus();
    this.form.showSaved();
  }

  /** Ask the background what the active tab is doing and show it. */
  async refreshStatus() {
    this.#state = TabState.from(await this.bus.send({ type: MSG.GET_ACTIVE_STATE }));
    this.status.render(this.#state);
    this.inactiveView.render(this.#state);
    this.#showRates();
  }

  /** The rates relevant to the active tab, as far as they are loaded. */
  #showRates() {
    if (this.#rates === undefined) this.ratesView.showLoading();
    else if (this.#rates === null) this.ratesView.showError();
    else this.ratesView.show(this.#rates, this.#state.currencies);
  }

  /** Show the saved settings and the rates of their currency. */
  async #showStoredSettings() {
    const { settings } = await this.store.load();
    this.form.show(settings);
    await this.selectCurrency(settings.currency);
  }

  /**
   * The current rates of `code`, from the background.
   * @param {string} code
   * @returns {Promise<ExchangeRates>}
   */
  async #requestRates(code) {
    const answer = await this.bus.send({ type: MSG.GET_RATES, base: code });
    if (!answer?.rates) throw new Error(answer?.error ?? "Exchange rates unavailable");
    return ExchangeRates.fromJSON(answer.rates, code, Currency.CODES);
  }
}
