import { storage, type WxtStorageItem } from "wxt/utils/storage";

import { ExchangeRates, type ExchangeRatesJSON } from "../core/rates/ExchangeRates.ts";
import type { AuctionKey } from "../core/settings/AuctionKey.ts";
import { BuyerCosts, type BuyerCostsJSON } from "../core/settings/BuyerCosts.ts";
import type { Settings } from "../core/settings/Settings.ts";
import { SettingsBook, type SettingsEntryJSON } from "../core/settings/SettingsBook.ts";

/** Saved rates per base currency. */
export type RatesByCurrency = Readonly<Record<string, ExchangeRates>>;

/** The stored values, as read: possibly of an older layout, possibly malformed. */
export type StoredLayout = { auctionSettings: unknown; exchangeRates: unknown };

/** Turns the stored values of the previous layout version into those of the next one. */
export type Migration = (stored: StoredLayout) => StoredLayout;

/**
 * The settings saved per auction, the buyer's own costs (saved once, for every
 * auction) and the exchange rates to convert into the settings' currencies, in
 * browser.storage.local. The panel writes, the content script
 * reads; storage is the channel between them (see CLAUDE.md, "Settings and the
 * effective price").
 *
 * Built on WXT's storage (`wxt/utils/storage`), which binds to the global
 * extension API when it is imported - the tests put WXT's `fakeBrowser` there.
 *
 * Layout: `{ auctionSettings: SettingsBook#toJSON(), exchangeRates: { [base]:
 * ExchangeRates#toJSON() }, buyerCosts: BuyerCosts#toJSON(), storageVersion }`.
 * Settings and buyer costs read missing values as their defaults, so adding a
 * value to either needs no new layout version.
 */
export class SettingsStore {
  /** browser.storage.local keys. */
  static KEYS = Object.freeze({
    settings: "auctionSettings",
    exchangeRates: "exchangeRates",
    buyerCosts: "buyerCosts",
    version: "storageVersion",
  });

  /**
   * Version of the stored layout. To change the layout, raise it and add the
   * conversion from the previous version to `MIGRATIONS`.
   */
  static VERSION = 1;

  /** `MIGRATIONS[n]` turns the values of layout version n - 1 into version n. None yet. */
  static MIGRATIONS: Readonly<Record<number, Migration>> = {};

  // Defined here, not at module level: defining an item reads it right away,
  // and entry points are imported in Node at build time (see CLAUDE.md).
  // Stored data may be malformed; `load()` validates whatever it reads.
  readonly #settings: WxtStorageItem<SettingsEntryJSON[], Record<string, never>>;
  readonly #rates: WxtStorageItem<Record<string, ExchangeRatesJSON>, Record<string, never>>;
  readonly #buyer: WxtStorageItem<BuyerCostsJSON | null, Record<string, never>>;
  /** null when nothing recorded it yet: data stored without a version is of version 1. */
  readonly #version: WxtStorageItem<number | null, Record<string, never>>;
  readonly #layout: { version: number; migrations: Readonly<Record<number, Migration>> };

  /** @param layout the current layout version and its migrations; for tests */
  constructor({ version = SettingsStore.VERSION, migrations = SettingsStore.MIGRATIONS } = {}) {
    const { KEYS } = SettingsStore;
    this.#settings = storage.defineItem(`local:${KEYS.settings}`, { fallback: [] });
    this.#rates = storage.defineItem(`local:${KEYS.exchangeRates}`, { fallback: {} });
    this.#buyer = storage.defineItem<BuyerCostsJSON>(`local:${KEYS.buyerCosts}`);
    this.#version = storage.defineItem<number>(`local:${KEYS.version}`);
    this.#layout = { version, migrations };
  }

  /**
   * The saved settings, the saved rates per base currency and the buyer costs,
   * read together (one storage.local.get, so never settings of one write with
   * rates of another) and converted to the current layout first if they are older.
   */
  async load(): Promise<{ book: SettingsBook; rates: RatesByCurrency; buyer: BuyerCosts }> {
    const { stored, buyer } = await this.#read();
    return {
      book: SettingsBook.from(stored.auctionSettings),
      rates: ratesFrom(stored.exchangeRates),
      buyer: BuyerCosts.from(buyer),
    };
  }

  /**
   * Save `settings` for the auction of `key`, and the rates of their currency
   * and the buyer costs when given, in one write - so listeners get one change
   * event and never see new settings without their rates.
   */
  async save(
    key: AuctionKey,
    settings: Settings,
    rates?: ExchangeRates,
    buyer?: BuyerCosts,
  ): Promise<void> {
    const { book, rates: saved } = await this.load();
    await storage.setItems([
      { item: this.#settings, value: book.with(key, settings).toJSON() },
      { item: this.#rates, value: ratesToJSON(rates ? { ...saved, [rates.base]: rates } : saved) },
      ...(buyer ? [{ item: this.#buyer, value: buyer.toJSON() }] : []),
      { item: this.#version, value: this.#layout.version },
    ]);
  }

  /**
   * Save fresh rates of one base currency, keeping everything else (the
   * settings are not written, so this never undoes a concurrent `save()`).
   */
  async saveRates(rates: ExchangeRates): Promise<void> {
    const { rates: saved } = await this.load();
    await this.#rates.setValue(ratesToJSON({ ...saved, [rates.base]: rates }));
  }

  /**
   * Call `listener` whenever settings, buyer costs or rates change, from any
   * extension page: once per changed key, so a `save()` calls it up to three
   * times - each call sees all new values, as they were written together.
   * @returns stops calling `listener`
   */
  onChange(listener: () => void): () => void {
    const items = [this.#settings, this.#rates, this.#buyer] as const;
    const unwatch = items.map((item) => item.watch(() => listener()));
    return () => unwatch.forEach((stop) => stop());
  }

  /**
   * Bring the stored data to the current layout version and record that
   * version. Called by the background on install and update, before anything
   * else writes - other contexts convert older data on reading in the meantime
   * (`load()`), and every `save()` writes the current layout.
   * @returns whether stored data was converted
   */
  async migrate(): Promise<boolean> {
    const { stored, from, versioned } = await this.#read();
    const migrated = from < this.#layout.version;
    if (versioned && !migrated) return false;
    await storage.setItems([
      ...(migrated
        ? [
            { item: this.#settings, value: stored.auctionSettings as SettingsEntryJSON[] },
            { item: this.#rates, value: stored.exchangeRates as Record<string, ExchangeRatesJSON> },
          ].filter(({ value }) => value != null)
        : []),
      { item: this.#version, value: this.#layout.version },
    ]);
    return migrated;
  }

  /**
   * The stored values in the current layout, and the version they were stored
   * in; the buyer costs, which no migration has touched so far, as stored.
   */
  async #read(): Promise<{
    stored: StoredLayout;
    buyer: unknown;
    from: number;
    versioned: boolean;
  }> {
    const [settings, rates, version, buyer] = await storage.getItems([
      this.#settings,
      this.#rates,
      this.#version,
      this.#buyer,
    ]);
    const versioned = typeof version?.value === "number";
    const from = versioned ? Number(version?.value) : 1;
    let stored: StoredLayout = { auctionSettings: settings?.value, exchangeRates: rates?.value };
    for (let next = from + 1; next <= this.#layout.version; next += 1) {
      stored = this.#layout.migrations[next]?.(stored) ?? stored;
    }
    return { stored, buyer: buyer?.value, from, versioned };
  }
}

/**
 * @param stored `{ [base]: ExchangeRates#toJSON() }`
 * @returns rates saved for another base than their key are dropped
 */
function ratesFrom(stored: unknown): RatesByCurrency {
  if (typeof stored !== "object" || stored === null) return {};
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
