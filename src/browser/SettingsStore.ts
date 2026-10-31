import type { WxtBrowser } from "wxt/browser";

import { ExchangeRates, type ExchangeRatesJSON } from "../core/rates/ExchangeRates.ts";
import { AuctionKey } from "../core/settings/AuctionKey.ts";
import { Settings } from "../core/settings/Settings.ts";
import { SettingsBook } from "../core/settings/SettingsBook.ts";

/** Saved rates per base currency. */
export type RatesByCurrency = Readonly<Record<string, ExchangeRates>>;

/** The parts of the extension API the store needs. */
export type StorageApi = { storage: Pick<WxtBrowser["storage"], "local" | "onChanged"> };

/**
 * The settings saved per auction and the exchange rates to convert into their
 * currencies, in browser.storage.local. The panel writes, the content script
 * reads; storage is the channel between them (see CLAUDE.md, "Settings and the
 * effective price").
 *
 * Layout: `{ auctionSettings: SettingsBook#toJSON(), exchangeRates: { [base]: ExchangeRates#toJSON() } }`.
 */
export class SettingsStore {
  /** browser.storage.local keys. */
  static KEYS = Object.freeze({ settings: "auctionSettings", exchangeRates: "exchangeRates" });

  /** Key of the 0.1.0 layout, one set of settings for every auction; see `migrate()`. */
  static GLOBAL_KEY = "settings";

  /** Keys of the layout before 0.1.0 had one key per setting; see `migrate()`. */
  static LEGACY_KEYS = Object.freeze({
    auctionPremium: "settings.auctionPremium",
    shipment: "settings.shipment",
    currency: "settings.currency",
    exchangeRates: "settings.exchangeRates",
  });

  readonly ext: StorageApi;

  /** @param ext the extension API (`browser` / `chrome`), injectable for tests */
  constructor(ext: StorageApi) {
    this.ext = ext;
  }

  /**
   * The saved settings and the saved rates per base currency.
   */
  async load(): Promise<{ book: SettingsBook; rates: RatesByCurrency }> {
    const { KEYS } = SettingsStore;
    const stored = (await this.ext.storage.local.get(Object.values(KEYS))) ?? {};
    return {
      book: SettingsBook.from(stored[KEYS.settings]),
      rates: ratesFrom(stored[KEYS.exchangeRates]),
    };
  }

  /**
   * Save `settings` for the auction of `key`, and the rates of their currency
   * when given, in one write - so listeners get one change event and never see
   * new settings without their rates.
   */
  async save(key: AuctionKey, settings: Settings, rates?: ExchangeRates): Promise<void> {
    const { KEYS } = SettingsStore;
    const { book, rates: saved } = await this.load();
    await this.ext.storage.local.set({
      [KEYS.settings]: book.with(key, settings).toJSON(),
      ...(rates && { [KEYS.exchangeRates]: ratesToJSON({ ...saved, [rates.base]: rates }) }),
    });
  }

  /**
   * Save fresh rates of one base currency, keeping everything else.
   */
  async saveRates(rates: ExchangeRates): Promise<void> {
    const { rates: saved } = await this.load();
    await this.ext.storage.local.set({
      [SettingsStore.KEYS.exchangeRates]: ratesToJSON({ ...saved, [rates.base]: rates }),
    });
  }

  /**
   * Call `listener` whenever settings or rates change, from any extension page.
   * @returns stops calling `listener`
   */
  onChange(listener: () => void): () => void {
    const keys = Object.values(SettingsStore.KEYS);
    const onChanged = (changes: object, area: string) => {
      if (area === "local" && keys.some((key) => key in changes)) listener();
    };
    this.ext.storage.onChanged.addListener(onChanged);
    return () => this.ext.storage.onChanged.removeListener(onChanged);
  }

  /**
   * Convert what older versions saved and remove their keys: settings saved for
   * every auction (one key per setting before 0.1.0, one `settings` key in
   * 0.1.0) become the settings of each of `sites`; rates saved for one currency
   * become the rates of that currency. Settings already saved per auction win.
   * @param sites origins of the configured sites
   * @returns whether there was anything to migrate
   */
  async migrate(sites: readonly string[]): Promise<boolean> {
    const { KEYS, GLOBAL_KEY, LEGACY_KEYS } = SettingsStore;
    const legacyKeys = Object.values(LEGACY_KEYS);
    const oldKeys = [...legacyKeys, GLOBAL_KEY];
    const stored = (await this.ext.storage.local.get([...oldKeys, ...Object.values(KEYS)])) ?? {};
    const singleRates = isSingleRates(stored[KEYS.exchangeRates]);
    if (!oldKeys.some((key) => key in stored) && !singleRates) return false;

    const updates: Record<string, unknown> = {};
    const legacySettings = legacyKeys.some((key) => key in stored) && {
      auctionPremium: stored[LEGACY_KEYS.auctionPremium],
      shipment: stored[LEGACY_KEYS.shipment],
      currency: stored[LEGACY_KEYS.currency],
    };
    const global = stored[GLOBAL_KEY] ?? legacySettings;
    if (global && !(KEYS.settings in stored)) {
      const settings = Settings.from(global);
      const book = sites.reduce(
        (sum, site) => sum.with(new AuctionKey({ site }), settings),
        new SettingsBook(),
      );
      updates[KEYS.settings] = book.toJSON();
    }
    const oldRates = singleRates
      ? stored[KEYS.exchangeRates]
      : !(KEYS.exchangeRates in stored) && stored[LEGACY_KEYS.exchangeRates];
    if (isSingleRates(oldRates)) {
      const rates = ExchangeRates.fromStorage(oldRates, oldRates.base);
      updates[KEYS.exchangeRates] = ratesToJSON({ [rates.base]: rates });
    }

    if (Object.keys(updates).length > 0) await this.ext.storage.local.set(updates);
    await this.ext.storage.local.remove(oldKeys);
    return true;
  }
}

/**
 * @param stored `{ [base]: ExchangeRates#toJSON() }`
 * @returns rates saved for another base than their key are dropped
 */
function ratesFrom(stored: unknown): RatesByCurrency {
  if (typeof stored !== "object" || stored === null || isSingleRates(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored)
      .map(([base, data]) => ExchangeRates.fromStorage(data, base))
      .filter((rates) => rates.date !== "" || Object.keys(rates.rates).length > 0)
      .map((rates) => [rates.base, rates]),
  );
}

function ratesToJSON(rates: RatesByCurrency): Record<string, ExchangeRatesJSON> {
  return Object.fromEntries(Object.entries(rates).map(([base, value]) => [base, value.toJSON()]));
}

/**
 * Is `stored` the rates of one currency, as 0.1.0 saved them (`{ base, date, rates }`)?
 */
function isSingleRates(stored: unknown): stored is { base: string } {
  return typeof (stored as { base?: unknown } | null | undefined)?.base === "string";
}
