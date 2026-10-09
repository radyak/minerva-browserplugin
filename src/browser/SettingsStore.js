import { ExchangeRates } from "../core/rates/ExchangeRates.js";
import { AuctionKey } from "../core/settings/AuctionKey.js";
import { Settings } from "../core/settings/Settings.js";
import { SettingsBook } from "../core/settings/SettingsBook.js";

/** @typedef {Readonly<Record<string, ExchangeRates>>} RatesByCurrency saved rates per base currency */

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

  /** @param {any} ext the extension API (`browser` / `chrome`), injectable for tests */
  constructor(ext) {
    this.ext = ext;
  }

  /**
   * The saved settings and the saved rates per base currency.
   * @returns {Promise<{book: SettingsBook, rates: RatesByCurrency}>}
   */
  async load() {
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
   * @param {AuctionKey} key
   * @param {Settings} settings
   * @param {ExchangeRates} [rates]
   */
  async save(key, settings, rates) {
    const { KEYS } = SettingsStore;
    const { book, rates: saved } = await this.load();
    await this.ext.storage.local.set({
      [KEYS.settings]: book.with(key, settings).toJSON(),
      ...(rates && { [KEYS.exchangeRates]: ratesToJSON({ ...saved, [rates.base]: rates }) }),
    });
  }

  /**
   * Save fresh rates of one base currency, keeping everything else.
   * @param {ExchangeRates} rates
   */
  async saveRates(rates) {
    const { rates: saved } = await this.load();
    await this.ext.storage.local.set({
      [SettingsStore.KEYS.exchangeRates]: ratesToJSON({ ...saved, [rates.base]: rates }),
    });
  }

  /**
   * Call `listener` whenever settings or rates change, from any extension page.
   * @param {() => void} listener
   */
  onChange(listener) {
    const keys = Object.values(SettingsStore.KEYS);
    this.ext.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && keys.some((key) => key in changes)) listener();
    });
  }

  /**
   * Convert what older versions saved and remove their keys: settings saved for
   * every auction (one key per setting before 0.1.0, one `settings` key in
   * 0.1.0) become the settings of each of `sites`; rates saved for one currency
   * become the rates of that currency. Settings already saved per auction win.
   * @param {readonly string[]} sites origins of the configured sites
   * @returns {Promise<boolean>} whether there was anything to migrate
   */
  async migrate(sites) {
    const { KEYS, GLOBAL_KEY, LEGACY_KEYS } = SettingsStore;
    const legacyKeys = Object.values(LEGACY_KEYS);
    const oldKeys = [...legacyKeys, GLOBAL_KEY];
    const stored = (await this.ext.storage.local.get([...oldKeys, ...Object.values(KEYS)])) ?? {};
    const singleRates = isSingleRates(stored[KEYS.exchangeRates]);
    if (!oldKeys.some((key) => key in stored) && !singleRates) return false;

    /** @type {Record<string, unknown>} */
    const updates = {};
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
 * @param {unknown} stored `{ [base]: ExchangeRates#toJSON() }`
 * @returns {RatesByCurrency} rates saved for another base than their key are dropped
 */
function ratesFrom(stored) {
  if (typeof stored !== "object" || stored === null || isSingleRates(stored)) return {};
  return Object.fromEntries(
    Object.entries(stored)
      .map(([base, data]) => ExchangeRates.fromStorage(data, base))
      .filter((rates) => rates.date !== "" || Object.keys(rates.rates).length > 0)
      .map((rates) => [rates.base, rates]),
  );
}

/**
 * @param {RatesByCurrency} rates
 * @returns {Record<string, ReturnType<ExchangeRates["toJSON"]>>}
 */
function ratesToJSON(rates) {
  return Object.fromEntries(Object.entries(rates).map(([base, value]) => [base, value.toJSON()]));
}

/**
 * Is `stored` the rates of one currency, as 0.1.0 saved them (`{ base, date, rates }`)?
 * @param {unknown} stored
 * @returns {stored is {base: string}}
 */
function isSingleRates(stored) {
  return typeof (/** @type {any} */ (stored)?.base) === "string";
}
