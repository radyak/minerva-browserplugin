import { Currency } from "../core/currency/Currency.js";
import { MSG } from "../core/messages.js";
import { ExchangeRates } from "../core/rates/ExchangeRates.js";
import { AuctionKey } from "../core/settings/AuctionKey.js";
import { Settings } from "../core/settings/Settings.js";
import { TabState } from "../core/state/TabState.js";
import { SelectedRates } from "./SelectedRates.js";
import { InactiveView } from "./views/InactiveView.js";
import { RatesView } from "./views/RatesView.js";
import { SettingsFormView } from "./views/SettingsFormView.js";
import { StatusView } from "./views/StatusView.js";

/**
 * Side panel (Chrome) / sidebar (Firefox): shows and saves the settings of the
 * auction in the active tab, what the extension does there and the exchange
 * rates from that tab's price currencies into the selected currency (loaded by
 * the background). Identical on both browsers; everything it touches is passed in.
 */
export class PanelController {
  /** @type {ExchangeRates | null | undefined} rates of the selected currency; undefined while loading, null when unavailable */
  #rates;
  /** @type {TabState} */
  #state = TabState.inactive();
  /** @type {AuctionKey | null} the auction of the active tab; null until its state is known */
  #key = null;
  /** @type {import("../core/settings/SettingsBook.js").ResolvedSettings | null} what the form was filled with; null for the defaults */
  #resolved = null;

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

  /** Wire the UI, then show the active tab's state and the settings saved for its auction. */
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

  /**
   * Save the entered settings for the auction in the active tab, with the
   * matching rates; the tab recalculates.
   */
  async save() {
    const key = this.#key;
    if (!this.form.validate() || !key?.site) return;
    const settings = this.form.read(this.#resolved?.settings ?? Settings.DEFAULT);
    // Settings and matching rates in one write: open tabs never see one without the other.
    // Without matching rates the page shows n/a until the background has fetched them.
    await this.store.save(
      key,
      settings,
      (await this.rates.ratesFor(settings.currency)) ?? undefined,
    );
    this.#resolved = (await this.store.load()).book.resolve(key);
    this.form.show(settings, this.#resolved?.scope ?? null);
    // Asking for the state makes the active tab re-read the settings and recalculate.
    await this.refreshStatus();
    this.form.showSaved();
  }

  /**
   * Ask the background what the active tab is doing and show it; when the tab
   * is on another auction than before, fill the form with its settings.
   */
  async refreshStatus() {
    this.#state = TabState.from(await this.bus.send({ type: MSG.GET_ACTIVE_STATE }));
    this.status.render(this.#state);
    this.inactiveView.render(this.#state);
    this.#showRates();
    const key = AuctionKey.from(this.#state);
    if (key.equals(this.#key)) return;
    this.#key = key;
    await this.#showSettingsFor(key);
  }

  /** The rates relevant to the active tab, as far as they are loaded. */
  #showRates() {
    if (this.#rates === undefined) this.ratesView.showLoading();
    else if (this.#rates === null) this.ratesView.showError();
    else this.ratesView.show(this.#rates, this.#state.currencies);
  }

  /**
   * Fill the form with the settings that apply to the auction of `key` - the
   * defaults when nothing saved does - and load the rates of their currency.
   * @param {AuctionKey} key
   */
  async #showSettingsFor(key) {
    const { book } = await this.store.load();
    if (!key.equals(this.#key)) return; // the tab moved on in the meantime
    this.#resolved = book.resolve(key);
    const settings = this.#resolved?.settings ?? Settings.DEFAULT;
    this.form.show(settings, this.#resolved?.scope ?? null);
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
