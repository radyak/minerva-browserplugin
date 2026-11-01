import { AuctionKey } from "./AuctionKey.ts";
import { Settings, type SettingsJSON } from "./Settings.ts";
import { SETTINGS_SCOPES, scopeMatches, type SettingsScope } from "./SettingsScope.ts";

/** Settings saved under the key of the page they were saved on. */
export type SettingsEntry = { key: AuctionKey; settings: Settings };

/** The entry `SettingsBook#resolve()` found, and the scope it was found on. */
export type ResolvedSettings = SettingsEntry & { scope: SettingsScope };

/** `SettingsBook#toJSON()`: one stored entry. */
export type SettingsEntryJSON = AuctionKey & { settings: SettingsJSON };

/**
 * Every set of settings saved in the panel, each under the AuctionKey of the
 * page it was saved on, and the lookup of the settings that apply to a page
 * (see SETTINGS_SCOPES). Entries are kept in the order they were saved, the
 * newest last. Immutable: `with()` returns a new book.
 */
export class SettingsBook {
  readonly entries: readonly SettingsEntry[];
  readonly scopes: readonly SettingsScope[];
  /**
   * @param entries oldest first, at most one per key
   * @param scopes most specific first
   */
  constructor(
    entries: readonly SettingsEntry[] = [],
    scopes: readonly SettingsScope[] = SETTINGS_SCOPES,
  ) {
    this.entries = Object.freeze([...entries]);
    this.scopes = scopes;
    Object.freeze(this);
  }

  /**
   * A book out of stored data (see `toJSON()`); entries without a site are dropped,
   * invalid settings fall back as in `Settings.from()`.
   */
  static from(data: unknown, scopes?: readonly SettingsScope[]): SettingsBook {
    const stored = Array.isArray(data) ? data : [];
    const entries = stored
      .map((entry) => ({ key: AuctionKey.from(entry), settings: Settings.from(entry?.settings) }))
      .filter(({ key }) => key.site !== null);
    return new SettingsBook(entries, scopes);
  }

  /**
   * The settings that apply to the page of `key`: the newest entry of the first
   * scope that has one.
   * @returns null when nothing saved applies
   */
  resolve(key: AuctionKey): ResolvedSettings | null {
    for (const scope of this.scopes) {
      const entry = this.entries.findLast((saved) => scopeMatches(scope, saved.key, key));
      if (entry) return { ...entry, scope };
    }
    return null;
  }

  /**
   * This book with `settings` saved under `key`, replacing what was saved under
   * exactly that key and becoming the newest entry.
   * @throws {Error} when the key has no site
   */
  with(key: AuctionKey, settings: Settings): SettingsBook {
    if (key.site === null) throw new Error("Settings can only be saved for a site");
    const others = this.entries.filter((entry) => !AuctionKey.equals(entry.key, key));
    // Only the key's own fields: `key` may be a whole TabState.
    return new SettingsBook([...others, { key: AuctionKey.from(key), settings }], this.scopes);
  }

  /** The currencies of all saved settings. */
  currencies(): Set<string> {
    return new Set(this.entries.map((entry) => entry.settings.currency));
  }

  /** Plain data to store. */
  toJSON(): SettingsEntryJSON[] {
    return this.entries.map(({ key, settings }) => ({
      ...key,
      settings: settings.toJSON(),
    }));
  }
}
