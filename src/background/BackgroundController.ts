import type { WxtBrowser } from "wxt/browser";

import type { MessageBus } from "../browser/MessageBus.ts";
import type { SettingsStore } from "../browser/SettingsStore.ts";
import { Currency } from "../core/currency/Currency.ts";
import { MSG } from "../core/messages.ts";
import type { ExchangeRatesJSON } from "../core/rates/ExchangeRates.ts";
import type { SiteRegistry } from "../core/sites/SiteRegistry.ts";
import { SITES } from "../core/sites/sites.config.ts";
import { TabState, type TabStateJSON } from "../core/state/TabState.ts";
import type { RatesService } from "./RatesService.ts";

type Deps = {
  /** the extension API */
  ext: Pick<WxtBrowser, "tabs" | "action" | "alarms" | "runtime">;
  bus: Pick<MessageBus, "on" | "sendToTab">;
  store: Pick<SettingsStore, "migrate">;
  rates: Pick<RatesService, "get" | "refreshSaved">;
  sites?: SiteRegistry;
};

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
  readonly ext: Deps["ext"];
  readonly bus: Deps["bus"];
  readonly store: Deps["store"];
  readonly rates: Deps["rates"];
  readonly sites: SiteRegistry;

  constructor({ ext, bus, store, rates, sites = SITES }: Deps) {
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
  start(): void {
    this.ext.runtime.onInstalled.addListener(async () => {
      // Settings saved by an older version: convert them once, on update.
      await this.store.migrate(this.sites.sites.map((site) => site.origin));
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
   */
  async ratesFor(base: unknown): Promise<{ rates: ExchangeRatesJSON } | { error: string }> {
    const currency = Currency.of(base);
    if (!currency) return { error: `Unsupported currency: ${String(base)}` };
    try {
      return { rates: (await this.rates.get(currency.code)).toJSON() };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Show "ON" on the toolbar button of `tabId` while the extension is active there.
   */
  updateBadge(tabId: number, active: boolean): void {
    this.ext.action?.setBadgeText({ tabId, text: active ? "ON" : "" });
    if (active) this.ext.action?.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
  }

  /** Create the daily refresh alarm unless it is already scheduled. */
  async #scheduleRatesRefresh(): Promise<void> {
    if (await this.ext.alarms.get(RATES_ALARM)) return;
    await this.ext.alarms.create(RATES_ALARM, {
      delayInMinutes: RATES_ALARM_MINUTES,
      periodInMinutes: RATES_ALARM_MINUTES,
    });
  }

  /**
   * The state of the active tab, freshly synced by its content script.
   */
  async activeTabState(): Promise<{ url: string | null } & TabStateJSON> {
    const [tab] = await this.ext.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { url: null, ...TabState.inactive().toJSON() };
    const state =
      tab.id === undefined
        ? undefined
        : await this.bus.sendToTab(tab.id, { type: MSG.SYNC_REQUEST });
    // No content script there (yet): judge by the URL alone.
    const site = this.sites.find(tab.url);
    const fallback = new TabState({
      active: site !== null,
      site: site?.origin ?? null,
      ...site?.identify(tab.url),
    });
    return state ?? { url: tab.url ?? null, ...fallback.toJSON() };
  }
}
