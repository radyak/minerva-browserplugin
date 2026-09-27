import { Currency } from "../core/currency/Currency.js";
import { MSG } from "../core/messages.js";
import { SITES } from "../core/sites/sites.config.js";
import { TabState } from "../core/state/TabState.js";

/** Badge colour while the extension is active in a tab (Bootstrap "danger"). */
const BADGE_COLOR = "#dc3545";

/** Name and period of the alarm that refreshes the saved exchange rates. */
const RATES_ALARM = "refresh-exchange-rates";
const RATES_ALARM_MINUTES = 24 * 60;

/**
 * Background script / service worker: owns the toolbar badge, watches tab
 * navigation, forwards sync requests to the content scripts, tells the panel
 * what the active tab is doing and owns the exchange rates (fetching them for
 * the panel, keeping the saved ones fresh). Everything it touches is passed in.
 */
export class BackgroundController {
  /**
   * @param {object} deps
   * @param {any} deps.ext the extension API (`tabs`, `action`, `alarms`, `runtime`)
   * @param {Pick<import("../browser/MessageBus.js").MessageBus, "on" | "sendToTab">} deps.bus
   * @param {Pick<import("../browser/SettingsStore.js").SettingsStore, "migrate">} deps.store
   * @param {Pick<import("./RatesService.js").RatesService, "get" | "refreshSaved">} deps.rates
   * @param {import("../core/sites/SiteRegistry.js").SiteRegistry} [deps.sites]
   */
  constructor({ ext, bus, store, rates, sites = SITES }) {
    this.ext = ext;
    this.bus = bus;
    this.store = store;
    this.rates = rates;
    this.sites = sites;
  }

  /**
   * Register every listener. Synchronously, as an MV3 service worker only
   * receives events whose listeners were added in its first turn.
   */
  start() {
    this.ext.runtime.onInstalled.addListener(async () => {
      // Settings saved by an older version: convert them once, on update.
      await this.store.migrate();
      await this.#scheduleRatesRefresh();
      await this.rates.refreshSaved();
    });
    this.ext.runtime.onStartup.addListener(async () => {
      // Firefox does not keep alarms across browser restarts.
      await this.#scheduleRatesRefresh();
      await this.rates.refreshSaved();
    });
    this.ext.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === RATES_ALARM) this.rates.refreshSaved();
    });

    this.ext.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      // `url` changes on real navigations and on history.pushState alike.
      if (!changeInfo.url && changeInfo.status !== "complete") return;
      this.updateBadge(tabId, this.sites.isTarget(changeInfo.url ?? tab?.url));
      this.bus.sendToTab(tabId, { type: MSG.SYNC_REQUEST });
    });

    this.bus
      .on(MSG.STATE_CHANGED, (message, sender) => {
        if (sender.tab?.id != null) this.updateBadge(sender.tab.id, TabState.from(message).active);
      })
      .on(MSG.GET_ACTIVE_STATE, () => this.activeTabState())
      .on(MSG.GET_RATES, (message) => this.ratesFor(message.base));
  }

  /**
   * The current rates of `base` for the panel, as plain data.
   * @param {unknown} base
   * @returns {Promise<{rates: ReturnType<import("../core/rates/ExchangeRates.js").ExchangeRates["toJSON"]>} | {error: string}>}
   */
  async ratesFor(base) {
    const currency = Currency.of(base);
    if (!currency) return { error: `Unsupported currency: ${String(base)}` };
    try {
      return { rates: (await this.rates.get(currency.code)).toJSON() };
    } catch (error) {
      return { error: String(error?.message ?? error) };
    }
  }

  /**
   * Show "ON" on the toolbar button of `tabId` while the extension is active there.
   * @param {number} tabId
   * @param {boolean} active
   */
  updateBadge(tabId, active) {
    this.ext.action?.setBadgeText({ tabId, text: active ? "ON" : "" });
    if (active) this.ext.action?.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
  }

  /** Create the daily refresh alarm unless it is already scheduled. */
  async #scheduleRatesRefresh() {
    if (await this.ext.alarms.get(RATES_ALARM)) return;
    await this.ext.alarms.create(RATES_ALARM, {
      delayInMinutes: RATES_ALARM_MINUTES,
      periodInMinutes: RATES_ALARM_MINUTES,
    });
  }

  /**
   * The state of the active tab, freshly synced by its content script.
   * @returns {Promise<{url: string | null, active: boolean, annotated: number, unparsable: number}>}
   */
  async activeTabState() {
    const [tab] = await this.ext.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { url: null, ...TabState.inactive().toJSON() };
    const state = await this.bus.sendToTab(tab.id, { type: MSG.SYNC_REQUEST });
    // No content script there (yet): judge by the URL alone.
    const fallback = new TabState({ active: this.sites.isTarget(tab.url) });
    return state ?? { url: tab.url ?? null, ...fallback.toJSON() };
  }
}
