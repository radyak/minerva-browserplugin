import { storage, type WxtStorageItem } from "wxt/utils/storage";

import { ExchangeRates, type ExchangeRatesJSON } from "../core/rates/ExchangeRates.ts";
import { AuctionKey } from "../core/settings/AuctionKey.ts";
import { Settings } from "../core/settings/Settings.ts";
import { SettingsBook, type SettingsEntryJSON } from "../core/settings/SettingsBook.ts";

/** Saved rates per base currency. */
export type RatesByCurrency = Readonly<Record<string, ExchangeRates>>;

/** The stored rates: `ExchangeRates#toJSON()` per base currency. */
type StoredRates = Record<string, ExchangeRatesJSON>;

/**
 * The settings saved per auction and the exchange rates to convert into their
 * currencies, in browser.storage.local. The panel writes, the content script
 * reads; storage is the channel between them (see CLAUDE.md, "Settings and the
 * effective price").
 *
 * Built on WXT's storage (`wxt/utils/storage`), which binds to the global
 * extension API when it is imported - the tests put WXT's `fakeBrowser` there.
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

  // Defined here, not at module level: defining an item reads it right away,
  // and entry points are imported in Node at build time (see CLAUDE.md).
  // Stored data may be malformed; `load()` validates whatever it reads.
  readonly #settings: WxtStorageItem<SettingsEntryJSON[], Record<string, never>>;
  readonly #rates: WxtStorageItem<StoredRates, Record<string, never>>;

  constructor() {
    const { KEYS } = SettingsStore;
    this.#settings = storage.defineItem<SettingsEntryJSON[]>(`local:${KEYS.settings}`, {
      fallback: [],
    });
    this.#rates = storage.defineItem<StoredRates>(`local:${KEYS.exchangeRates}`, {
      fallback: {},
    });
  }

  /**
   * The saved settings and the saved rates per base currency, read together.
   */
  async load(): Promise<{ book: SettingsBook; rates: RatesByCurrency }> {
    // One storage.local.get for both: never settings of one write with rates of another.
    const [settings, rates] = await storage.getItems([this.#settings, this.#rates]);
    return { book: SettingsBook.from(settings?.value), rates: ratesFrom(rates?.value) };
  }

  /**
   * Save `settings` for the auction of `key`, and the rates of their currency
   * when given, in one write - so listeners get one change event and never see
   * new settings without their rates.
   */
  async save(key: AuctionKey, settings: Settings, rates?: ExchangeRates): Promise<void> {
    const { book, rates: saved } = await this.load();
    await storage.setItems([
      { item: this.#settings, value: book.with(key, settings).toJSON() },
      ...(rates
        ? [{ item: this.#rates, value: ratesToJSON({ ...saved, [rates.base]: rates }) }]
        : []),
    ]);
  }

  /**
   * Save fresh rates of one base currency, keeping everything else.
   */
  async saveRates(rates: ExchangeRates): Promise<void> {
    const { rates: saved } = await this.load();
    await this.#rates.setValue(ratesToJSON({ ...saved, [rates.base]: rates }));
  }

  /**
   * Call `listener` whenever settings or rates change, from any extension page:
   * once per changed key, so a `save()` with rates calls it twice - each call
   * sees both new values, as they were written together.
   * @returns stops calling `listener`
   */
  onChange(listener: () => void): () => void {
    const unwatch = [this.#settings, this.#rates].map((item) => item.watch(() => listener()));
    return () => unwatch.forEach((stop) => stop());
  }

  /**
   * Convert what older versions saved and remove their keys: settings saved for
   * every auction (one key per setting before 0.1.0, one `settings` key in
   * 0.1.0) become the settings of each of `sites`; rates saved for one currency
   * become the rates of that currency. Settings already saved per auction win.
   *
   * This is not a job for WXT's versioned items (`version` + `migrations`): those
   * migrate one key's value, while this turns old keys into new ones and needs
   * `sites`. Use them for changes of the current keys from now on.
   * @param sites origins of the configured sites
   * @returns whether there was anything to migrate
   */
  async migrate(sites: readonly string[]): Promise<boolean> {
    const { KEYS, GLOBAL_KEY, LEGACY_KEYS } = SettingsStore;
    const legacyKeys = Object.values(LEGACY_KEYS);
    const oldKeys = [...legacyKeys, GLOBAL_KEY];
    const stored = await readLocal([...oldKeys, ...Object.values(KEYS)]);
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

    const writes = Object.entries(updates).map(([key, value]) => ({
      key: `local:${key}` as const,
      value,
    }));
    if (writes.length > 0) await storage.setItems(writes);
    await storage.removeItems(oldKeys.map((key) => `local:${key}` as const));
    return true;
  }
}

/**
 * The values of `keys` in storage.local, in one read; keys without a value are left out.
 */
async function readLocal(keys: readonly string[]): Promise<Record<string, unknown>> {
  const values = await storage.getItems(keys.map((key) => `local:${key}` as const));
  return Object.fromEntries(
    values
      .filter(({ value }) => value !== null)
      .map(({ key, value }) => [key.slice("local:".length), value]),
  );
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
