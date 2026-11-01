import type { WxtBrowser } from "wxt/browser";

import type { MessageBus } from "../browser/MessageBus.ts";
import type { SettingsStore } from "../browser/SettingsStore.ts";
import { Currency } from "../core/currency/Currency.ts";
import { MSG } from "../core/messages.ts";
import type { ExchangeRatesJSON } from "../core/rates/ExchangeRates.ts";
import { SITES } from "../core/sites/sites.config.ts";
import { findSite, type AuctionSite } from "../core/sites/sites.ts";
import { TabState } from "../core/state/TabState.ts";
import type { RatesService } from "./RatesService.ts";

type Deps = {
  /** the extension API */
  ext: Pick<WxtBrowser, "tabs" | "action" | "alarms" | "runtime">;
  bus: Pick<MessageBus, "on" | "sendToTab">;
  store: Pick<SettingsStore, "migrate">;
  rates: Pick<RatesService, "get" | "refreshSaved">;
  sites?: readonly AuctionSite[];
};

/** Badge colour while the extension is active in a tab (Bootstrap "danger"). */
const BADGE_COLOR = "#dc3545";

/** Name and period of the alarm that refreshes the saved exchange rates. */
const RATES_ALARM = "refresh-exchange-rates";
const RATES_ALARM_MINUTES = 24 * 60;

/**
 * Background script / service worker: owns the toolbar badge, watches tab
 * navigation and asks the content scripts to sync, migrates the stored data and
 * owns the exchange rates (fetching them for the panel, keeping the saved ones
 * fresh). Everything it touches is passed in.
 */
export class BackgroundController {
  readonly #deps: Required<Deps>;

  constructor(deps: Deps) {
    this.#deps = { sites: SITES, ...deps };
  }

  /**
   * Register every listener. Synchronously, as an MV3 service worker only
   * receives events whose listeners were added in its first turn.
   */
  start(): void {
    const { ext, bus, store, rates, sites } = this.#deps;
    ext.runtime.onInstalled.addListener(async () => {
      // Stored data of an older layout: convert it once, on update.
      await store.migrate();
      await this.#scheduleRatesRefresh();
      await rates.refreshSaved();
    });
    ext.runtime.onStartup.addListener(async () => {
      // Firefox does not keep alarms across browser restarts.
      await this.#scheduleRatesRefresh();
      await rates.refreshSaved();
    });
    ext.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === RATES_ALARM) rates.refreshSaved();
    });

    ext.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      // `url` changes on real navigations and on history.pushState alike.
      if (!changeInfo.url && changeInfo.status !== "complete") return;
      this.updateBadge(tabId, findSite(sites, changeInfo.url ?? tab?.url) !== null);
      bus.sendToTab(tabId, { type: MSG.SYNC_REQUEST });
    });

    bus
      .on(MSG.STATE_CHANGED, (message, sender) => {
        if (sender.tab?.id != null) this.updateBadge(sender.tab.id, TabState.from(message).active);
      })
      .on(MSG.GET_RATES, (message) => this.ratesFor(message.base));
  }

  /**
   * The current rates of `base` for the panel, as plain data.
   */
  async ratesFor(base: unknown): Promise<{ rates: ExchangeRatesJSON } | { error: string }> {
    const currency = Currency.of(base);
    if (!currency) return { error: `Unsupported currency: ${String(base)}` };
    try {
      return { rates: (await this.#deps.rates.get(currency.code)).toJSON() };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  /**
   * Show "ON" on the toolbar button of `tabId` while the extension is active there.
   */
  updateBadge(tabId: number, active: boolean): void {
    const { action } = this.#deps.ext;
    action?.setBadgeText({ tabId, text: active ? "ON" : "" });
    if (active) action?.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
  }

  /** Create the daily refresh alarm unless it is already scheduled. */
  async #scheduleRatesRefresh(): Promise<void> {
    const { alarms } = this.#deps.ext;
    if (await alarms.get(RATES_ALARM)) return;
    await alarms.create(RATES_ALARM, {
      delayInMinutes: RATES_ALARM_MINUTES,
      periodInMinutes: RATES_ALARM_MINUTES,
    });
  }
}
