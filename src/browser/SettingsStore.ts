import { storage, type WxtStorageItem } from "wxt/utils/storage";

import { ExchangeRates, type ExchangeRatesJSON } from "../core/rates/ExchangeRates.ts";
import type { AuctionKey } from "../core/settings/AuctionKey.ts";
import type { Settings } from "../core/settings/Settings.ts";
import { SettingsBook, type SettingsEntryJSON } from "../core/settings/SettingsBook.ts";

/** Saved rates per base currency. */
export type RatesByCurrency = Readonly<Record<string, ExchangeRates>>;

/** The stored values, as read: possibly of an older layout, possibly malformed. */
export type StoredLayout = { auctionSettings: unknown; exchangeRates: unknown; currency: unknown };

/** Turns the stored values of the previous layout version into those of the next one. */
export type Migration = (stored: StoredLayout) => StoredLayout;

/**
 * The settings saved per auction, the user's currency (one for every auction)
 * and the exchange rates to convert into it, in browser.storage.local. The panel writes, the content script
 * reads; storage is the channel between them (see CLAUDE.md, "Settings and the
 * effective price").
 *
 * Built on WXT's storage (`wxt/utils/storage`), which binds to the global
 * extension API when it is imported - the tests put WXT's `fakeBrowser` there.
 *
 * Layout: `{ auctionSettings: SettingsBook#toJSON(), currency: SettingsBook#currency,
 * exchangeRates: { [base]: ExchangeRates#toJSON() }, storageVersion }`. Settings read missing values as
 * their defaults, so adding a value to them needs no new layout version.
 */
export class SettingsStore {
  /** browser.storage.local keys. */
  static KEYS = Object.freeze({
    settings: "auctionSettings",
    currency: "currency",
    exchangeRates: "exchangeRates",
    version: "storageVersion",
  });

  /**
   * Version of the stored layout. To change the layout, raise it and add the
   * conversion from the previous version to `MIGRATIONS`.
   */
  static VERSION = 2;

  /** `MIGRATIONS[n]` turns the values of layout version n - 1 into version n. */
  static MIGRATIONS: Readonly<Record<number, Migration>> = {
    // The currency moves out of every auction's settings into one global value:
    // the newest entry's, the currency picked last.
    2: ({ auctionSettings, exchangeRates }) => {
      if (!Array.isArray(auctionSettings)) {
        return { auctionSettings, exchangeRates, currency: undefined };
      }
      return {
        auctionSettings: auctionSettings.map((entry) =>
          entry?.settings ? { ...entry, settings: withoutCurrency(entry.settings) } : entry,
        ),
        exchangeRates,
        currency: auctionSettings.at(-1)?.settings?.currency,
      };
    },
  };

  // Defined here, not at module level: defining an item reads it right away,
  // and entry points are imported in Node at build time (see CLAUDE.md).
  // Stored data may be malformed; `load()` validates whatever it reads. No
  // fallbacks: null tells an empty storage (a fresh install) from stored data.
  readonly #settings: WxtStorageItem<SettingsEntryJSON[] | null, Record<string, never>>;
  /** null when nothing was saved yet: the default currency applies. */
  readonly #currency: WxtStorageItem<string | null, Record<string, never>>;
  readonly #rates: WxtStorageItem<Record<string, ExchangeRatesJSON> | null, Record<string, never>>;
  /** null when nothing recorded it yet: data stored without a version is of version 1. */
  readonly #version: WxtStorageItem<number | null, Record<string, never>>;
  readonly #layout: { version: number; migrations: Readonly<Record<number, Migration>> };

  /** @param layout the current layout version and its migrations; for tests */
  constructor({ version = SettingsStore.VERSION, migrations = SettingsStore.MIGRATIONS } = {}) {
    const { KEYS } = SettingsStore;
    this.#settings = storage.defineItem<SettingsEntryJSON[]>(`local:${KEYS.settings}`);
    this.#currency = storage.defineItem<string>(`local:${KEYS.currency}`);
    this.#rates = storage.defineItem<Record<string, ExchangeRatesJSON>>(
      `local:${KEYS.exchangeRates}`,
    );
    this.#version = storage.defineItem<number>(`local:${KEYS.version}`);
    this.#layout = { version, migrations };
  }

  /**
   * The saved settings with the user's currency and the saved rates per base
   * currency, read together (one storage.local.get, so never settings of one
   * write with rates of another) and converted to the current layout first if
   * they are older.
   */
  async load(): Promise<{ book: SettingsBook; rates: RatesByCurrency }> {
    const { stored } = await this.#read();
    return {
      book: SettingsBook.from(stored.auctionSettings, { currency: stored.currency }),
      rates: ratesFrom(stored.exchangeRates),
    };
  }

  /**
   * Save `settings` for the auction of `key`, their currency as the user's
   * currency for every auction, and the rates of that currency when given, in
   * one write - so nobody sees new settings without their rates.
   */
  async save(key: AuctionKey, settings: Settings, rates?: ExchangeRates): Promise<void> {
    const { book, rates: saved } = await this.load();
    const next = book.with(key, settings);
    await storage.setItems([
      { item: this.#settings, value: next.toJSON() },
      { item: this.#currency, value: next.currency },
      { item: this.#rates, value: ratesToJSON(rates ? { ...saved, [rates.base]: rates } : saved) },
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
   * Call `listener` whenever settings, the currency or rates change, from any
   * extension page: once per changed key, so a `save()` calls it up to three
   * times - each call sees all new values, as they were written together.
   * @returns stops calling `listener`
   */
  onChange(listener: () => void): () => void {
    const items = [this.#settings, this.#currency, this.#rates] as const;
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
    const { stored, from, versioned, empty } = await this.#read();
    const migrated = from < this.#layout.version && !empty;
    if (versioned && !migrated) return false;
    await storage.setItems([
      ...(migrated
        ? [
            { item: this.#settings, value: stored.auctionSettings as SettingsEntryJSON[] },
            { item: this.#currency, value: stored.currency as string },
            { item: this.#rates, value: stored.exchangeRates as Record<string, ExchangeRatesJSON> },
          ].filter(({ value }) => value != null)
        : []),
      { item: this.#version, value: this.#layout.version },
    ]);
    return migrated;
  }

  /**
   * The stored values in the current layout, the version they were stored in,
   * and whether nothing is stored at all.
   */
  async #read(): Promise<{
    stored: StoredLayout;
    from: number;
    versioned: boolean;
    empty: boolean;
  }> {
    const [settings, currency, rates, version] = await storage.getItems([
      this.#settings,
      this.#currency,
      this.#rates,
      this.#version,
    ]);
    const versioned = typeof version?.value === "number";
    const from = versioned ? Number(version?.value) : 1;
    let stored: StoredLayout = {
      auctionSettings: settings?.value,
      exchangeRates: rates?.value,
      currency: currency?.value,
    };
    const empty = Object.values(stored).every((value) => value == null);
    for (let next = from + 1; next <= this.#layout.version; next += 1) {
      stored = this.#layout.migrations[next]?.(stored) ?? stored;
    }
    return { stored, from, versioned, empty };
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

/** Stored settings of layout version 1 without their currency. */
function withoutCurrency(settings: unknown): unknown {
  if (typeof settings !== "object" || settings === null) return settings;
  return Object.fromEntries(Object.entries(settings).filter(([name]) => name !== "currency"));
}

function ratesToJSON(rates: RatesByCurrency): Record<string, ExchangeRatesJSON> {
  return Object.fromEntries(Object.entries(rates).map(([base, value]) => [base, value.toJSON()]));
}
