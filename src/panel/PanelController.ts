import type { WxtBrowser } from "wxt/browser";

import type { MessageBus } from "../browser/MessageBus.ts";
import type { SettingsStore } from "../browser/SettingsStore.ts";
import { Currency } from "../core/currency/Currency.ts";
import { MSG } from "../core/messages.ts";
import { ExchangeRates } from "../core/rates/ExchangeRates.ts";
import { AuctionKey } from "../core/settings/AuctionKey.ts";
import { Settings } from "../core/settings/Settings.ts";
import type { ResolvedSettings } from "../core/settings/SettingsBook.ts";
import { TabState } from "../core/state/TabState.ts";
import { SelectedRates } from "./SelectedRates.ts";
import { AuctionView } from "./views/AuctionView.ts";
import { InactiveView } from "./views/InactiveView.ts";
import { RatesView } from "./views/RatesView.ts";
import { SettingsFormView } from "./views/SettingsFormView.ts";
import { StatusView } from "./views/StatusView.ts";

type Deps = {
  /** the panel document (src/entrypoints/sidepanel/index.html) */
  document: Document;
  /** the extension `tabs` API */
  tabs: Pick<WxtBrowser["tabs"], "onActivated" | "onUpdated">;
  bus: Pick<MessageBus, "on" | "send">;
  store: Pick<SettingsStore, "load" | "save">;
};

/**
 * Side panel (Chrome) / sidebar (Firefox): shows and saves the settings of the
 * auction in the active tab, what the extension does there and the exchange
 * rates from that tab's price currencies into the selected currency (loaded by
 * the background). Identical on both browsers; everything it touches is passed in.
 */
export class PanelController {
  /** rates of the selected currency; undefined while loading, null when unavailable */
  #rates: ExchangeRates | null | undefined;
  #state: TabState = TabState.inactive();
  /** the auction of the active tab; null until its state is known */
  #key: AuctionKey | null = null;
  /** what the form was filled with; null for the defaults */
  #resolved: ResolvedSettings | null = null;

  readonly tabs: Deps["tabs"];
  readonly bus: Deps["bus"];
  readonly store: Deps["store"];
  readonly rates: SelectedRates;
  readonly form: SettingsFormView;
  readonly status: StatusView;
  readonly auctionView: AuctionView;
  readonly inactiveView: InactiveView;
  readonly ratesView: RatesView;

  constructor({ document, tabs, bus, store }: Deps) {
    this.tabs = tabs;
    this.bus = bus;
    this.store = store;
    this.rates = new SelectedRates((code) => this.#requestRates(code));
    this.form = new SettingsFormView(document);
    this.status = new StatusView(document.getElementById("status") as HTMLElement);
    this.auctionView = new AuctionView({
      ids: document.getElementById("auction-ids") as HTMLElement,
      house: document.getElementById("auction-house") as HTMLElement,
      auction: document.getElementById("auction-id") as HTMLElement,
      source: document.getElementById("settings-source") as HTMLElement,
    });
    this.inactiveView = new InactiveView({
      form: document.getElementById("settings") as HTMLElement,
      notice: document.getElementById("inactive") as HTMLElement,
      text: document.getElementById("inactive-text") as HTMLElement,
    });
    this.ratesView = new RatesView({
      body: document.getElementById("rates") as HTMLElement,
      info: document.getElementById("rates-info") as HTMLElement,
    });
  }

  /** Wire the UI, then show the active tab's state and the settings saved for its auction. */
  async start(): Promise<void> {
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
   * Follow a (newly) selected currency: load its exchange rates.
   */
  async selectCurrency(code: string) {
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
    if (!this.form.validate() || !key?.site || !this.#state.onAuction) return;
    const settings = this.form.read(this.#resolved?.settings ?? Settings.DEFAULT);
    // Settings and matching rates in one write: open tabs never see one without the other.
    // Without matching rates the page shows n/a until the background has fetched them.
    await this.store.save(
      key,
      settings,
      (await this.rates.ratesFor(settings.currency)) ?? undefined,
    );
    this.#resolved = (await this.store.load()).book.resolve(key);
    this.form.show(settings);
    this.auctionView.showSource(this.#resolved?.scope ?? null);
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
    this.auctionView.render(this.#state);
    this.inactiveView.render(this.#state);
    this.form.showShipmentCurrency(this.#state.currencies);
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
   */
  async #showSettingsFor(key: AuctionKey) {
    const { book } = await this.store.load();
    if (!key.equals(this.#key)) return; // the tab moved on in the meantime
    this.#resolved = book.resolve(key);
    const settings = this.#resolved?.settings ?? Settings.DEFAULT;
    this.form.show(settings);
    this.auctionView.showSource(this.#resolved?.scope ?? null);
    await this.selectCurrency(settings.currency);
  }

  /**
   * The current rates of `code`, from the background.
   */
  async #requestRates(code: string): Promise<ExchangeRates> {
    const answer = await this.bus.send({ type: MSG.GET_RATES, base: code });
    if (!answer) throw new Error("Exchange rates unavailable");
    if ("error" in answer) throw new Error(answer.error);
    return ExchangeRates.fromJSON(answer.rates, code, Currency.CODES);
  }
}
