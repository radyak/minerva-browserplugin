import { ExchangeRates } from "../core/rates/ExchangeRates.js";
import { Settings } from "../core/settings/Settings.js";

/**
 * The user's settings and the exchange rates saved with them, in
 * browser.storage.local. The panel writes, the content script reads; storage
 * is the channel between them (see CLAUDE.md, "Settings and the effective price").
 *
 * Layout: `{ settings: Settings#toJSON(), exchangeRates: ExchangeRates#toJSON() }`.
 */
export class SettingsStore {
  /** browser.storage.local keys. */
  static KEYS = Object.freeze({ settings: "settings", exchangeRates: "exchangeRates" });

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
   * The saved settings (defaults for anything unset or invalid) and the rates
   * to convert into their currency (empty when none were saved for it).
   * @returns {Promise<{settings: Settings, rates: ExchangeRates}>}
   */
  async load() {
    const { KEYS } = SettingsStore;
    const stored = (await this.ext.storage.local.get(Object.values(KEYS))) ?? {};
    const settings = Settings.from(stored[KEYS.settings]);
    return {
      settings,
      rates: ExchangeRates.fromStorage(stored[KEYS.exchangeRates], settings.currency),
    };
  }

  /**
   * Save the settings, and the rates when given, in one write - so listeners
   * get one change event and never see new settings with old rates.
   * @param {Settings} settings
   * @param {ExchangeRates} [rates]
   */
  async save(settings, rates) {
    const { KEYS } = SettingsStore;
    await this.ext.storage.local.set({
      [KEYS.settings]: settings.toJSON(),
      ...(rates && { [KEYS.exchangeRates]: rates.toJSON() }),
    });
  }

  /**
   * Save fresh rates on their own, keeping the settings.
   * @param {ExchangeRates} rates
   */
  async saveRates(rates) {
    await this.ext.storage.local.set({ [SettingsStore.KEYS.exchangeRates]: rates.toJSON() });
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
   * Move settings saved with one key per setting into the current layout and
   * remove the old keys. Settings already saved in the current layout win.
   * @returns {Promise<boolean>} whether there was anything to migrate
   */
  async migrate() {
    const { KEYS, LEGACY_KEYS } = SettingsStore;
    const legacyKeys = Object.values(LEGACY_KEYS);
    const stored = (await this.ext.storage.local.get([...legacyKeys, KEYS.settings])) ?? {};
    if (!legacyKeys.some((key) => key in stored)) return false;

    if (!(KEYS.settings in stored)) {
      const settings = Settings.from({
        auctionPremium: stored[LEGACY_KEYS.auctionPremium],
        shipment: stored[LEGACY_KEYS.shipment],
        currency: stored[LEGACY_KEYS.currency],
      });
      const rates = ExchangeRates.fromStorage(stored[LEGACY_KEYS.exchangeRates], settings.currency);
      await this.save(settings, rates);
    }
    await this.ext.storage.local.remove(legacyKeys);
    return true;
  }
}
