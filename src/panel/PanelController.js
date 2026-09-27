import { MSG } from "../core/messages.js";
import { TabState } from "../core/state/TabState.js";
import { RatesService } from "./RatesService.js";
import { RatesView } from "./views/RatesView.js";
import { SettingsFormView } from "./views/SettingsFormView.js";
import { StatusView } from "./views/StatusView.js";

/**
 * Side panel (Chrome) / sidebar (Firefox): shows and saves the settings, the
 * exchange rates of the selected currency and what the extension does in the
 * active tab. Identical on both browsers; everything it touches is passed in.
 */
export class PanelController {
  /**
   * @param {object} deps
   * @param {Document} deps.document the panel document (panel.html)
   * @param {any} deps.tabs the extension `tabs` API (`onActivated`, `onUpdated`)
   * @param {Pick<import("../browser/MessageBus.js").MessageBus, "on" | "send">} deps.bus
   * @param {Pick<import("../browser/SettingsStore.js").SettingsStore, "load" | "save" | "saveRates">} deps.store
   * @param {RatesService} [deps.rates]
   */
  constructor({ document, tabs, bus, store, rates = new RatesService() }) {
    this.tabs = tabs;
    this.bus = bus;
    this.store = store;
    this.rates = rates;
    this.form = new SettingsFormView(document);
    this.status = new StatusView(/** @type {HTMLElement} */ (document.getElementById("status")));
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
    this.ratesView.showLoading();
    const { rates, latest } = await this.rates.load(code);
    if (!latest) return; // another currency was picked in the meantime
    if (rates) this.ratesView.show(rates);
    else this.ratesView.showError();
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
    this.status.render(TabState.from(await this.bus.send({ type: MSG.GET_ACTIVE_STATE })));
  }

  /**
   * Show the saved settings and refresh the saved rates with the ones just
   * loaded for their currency; open tabs recalculate via storage.onChanged.
   */
  async #showStoredSettings() {
    const { settings } = await this.store.load();
    this.form.show(settings);
    await this.selectCurrency(settings.currency);
    const rates = await this.rates.ratesFor(settings.currency);
    if (rates) await this.store.saveRates(rates);
  }
}
