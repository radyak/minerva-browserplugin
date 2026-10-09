import { AuctionKey } from "./AuctionKey.js";
import { Settings } from "./Settings.js";
import { SETTINGS_SCOPES } from "./SettingsScope.js";

/** @typedef {import("./SettingsScope.js").SettingsScope} SettingsScope */
/** @typedef {{key: AuctionKey, settings: Settings}} SettingsEntry */
/** @typedef {{key: AuctionKey, settings: Settings, scope: SettingsScope}} ResolvedSettings */

/**
 * Every set of settings saved in the panel, each under the AuctionKey of the
 * page it was saved on, and the lookup of the settings that apply to a page
 * (see SETTINGS_SCOPES). Entries are kept in the order they were saved, the
 * newest last. Immutable: `with()` returns a new book.
 */
export class SettingsBook {
  /**
   * @param {readonly SettingsEntry[]} [entries] oldest first, at most one per key
   * @param {readonly SettingsScope[]} [scopes] most specific first
   */
  constructor(entries = [], scopes = SETTINGS_SCOPES) {
    /** @readonly */
    this.entries = Object.freeze([...entries]);
    /** @readonly */
    this.scopes = scopes;
    Object.freeze(this);
  }

  /**
   * A book out of stored data (see `toJSON()`); entries without a site are dropped,
   * invalid settings fall back as in `Settings.from()`.
   * @param {unknown} data
   * @param {readonly SettingsScope[]} [scopes]
   * @returns {SettingsBook}
   */
  static from(data, scopes) {
    const stored = Array.isArray(data) ? data : [];
    const entries = stored
      .map((entry) => ({ key: AuctionKey.from(entry), settings: Settings.from(entry?.settings) }))
      .filter(({ key }) => key.site !== null);
    return new SettingsBook(entries, scopes);
  }

  /**
   * The settings that apply to the page of `key`: the newest entry of the first
   * scope that has one.
   * @param {AuctionKey} key
   * @returns {ResolvedSettings | null} null when nothing saved applies
   */
  resolve(key) {
    for (const scope of this.scopes) {
      const entry = this.entries.findLast((saved) => scope.matches(saved.key, key));
      if (entry) return { ...entry, scope };
    }
    return null;
  }

  /**
   * This book with `settings` saved under `key`, replacing what was saved under
   * exactly that key and becoming the newest entry.
   * @param {AuctionKey} key
   * @param {Settings} settings
   * @returns {SettingsBook}
   * @throws {Error} when the key has no site
   */
  with(key, settings) {
    if (key.site === null) throw new Error("Settings can only be saved for a site");
    const others = this.entries.filter((entry) => !entry.key.equals(key));
    return new SettingsBook([...others, { key, settings }], this.scopes);
  }

  /** @returns {Set<string>} the currencies of all saved settings */
  currencies() {
    return new Set(this.entries.map((entry) => entry.settings.currency));
  }

  /** @returns {Array<ReturnType<AuctionKey["toJSON"]> & {settings: ReturnType<Settings["toJSON"]>}>} plain data to store */
  toJSON() {
    return this.entries.map(({ key, settings }) => ({
      ...key.toJSON(),
      settings: settings.toJSON(),
    }));
  }
}
