import { UserCurrency } from "../currency/UserCurrency.ts";
import { AuctionKey } from "./AuctionKey.ts";
import { Settings, type AuctionSettingsJSON } from "./Settings.ts";
import { SETTINGS_SCOPES, scopeMatches, type SettingsScope } from "./SettingsScope.ts";

/** Settings saved under the key of the page they were saved on. */
export type SettingsEntry = { key: AuctionKey; settings: Settings };

/** The entry `SettingsBook#resolve()` found, and the scope it was found on. */
export type ResolvedSettings = SettingsEntry & { scope: SettingsScope };

/** `SettingsBook#toJSON()`: one stored entry, without the (global) currency. */
export type SettingsEntryJSON = AuctionKey & { settings: AuctionSettingsJSON };

/**
 * Every set of settings saved in the panel, each under the AuctionKey of the
 * page it was saved on, and the lookup of the settings that apply to a page
 * (see SETTINGS_SCOPES). Entries are kept in the order they were saved, the
 * newest last. The user's currency is not part of an entry: the book holds
 * one for every auction and every entry carries it. Immutable: `with()`
 * returns a new book.
 */
export class SettingsBook {
  readonly entries: readonly SettingsEntry[];
  readonly scopes: readonly SettingsScope[];
  /** the user's currency, for every auction */
  readonly currency: string;
  /** `Settings.DEFAULT` in the user's currency: what applies where nothing saved does */
  readonly defaults: Settings;
  /**
   * @param entries oldest first, at most one per key; their currency is replaced by `currency`
   * @param options.currency the user's currency; the default one when invalid
   * @param options.scopes most specific first
   */
  constructor(
    entries: readonly SettingsEntry[] = [],
    {
      currency = Settings.DEFAULT.currency,
      scopes = SETTINGS_SCOPES,
    }: { currency?: string; scopes?: readonly SettingsScope[] } = {},
  ) {
    this.currency = UserCurrency.orDefault(currency);
    this.defaults = Settings.DEFAULT.withCurrency(this.currency);
    this.entries = Object.freeze(
      entries.map(({ key, settings }) => ({ key, settings: settings.withCurrency(this.currency) })),
    );
    this.scopes = scopes;
    Object.freeze(this);
  }

  /**
   * A book out of stored data (see `toJSON()`) and the stored currency; entries
   * without a site are dropped, invalid settings fall back as in `Settings.from()`.
   */
  static from(
    data: unknown,
    { currency, scopes }: { currency?: unknown; scopes?: readonly SettingsScope[] } = {},
  ): SettingsBook {
    const stored = Array.isArray(data) ? data : [];
    const entries = stored
      .map((entry) => ({ key: AuctionKey.from(entry), settings: Settings.from(entry?.settings) }))
      .filter(({ key }) => key.site !== null);
    return new SettingsBook(entries, {
      currency: UserCurrency.orDefault(currency),
      scopes,
    });
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
   * exactly that key and becoming the newest entry, and with their currency as
   * the user's currency - for every auction.
   * @throws {Error} when the key has no site
   */
  with(key: AuctionKey, settings: Settings): SettingsBook {
    if (key.site === null) throw new Error("Settings can only be saved for a site");
    const others = this.entries.filter((entry) => !AuctionKey.equals(entry.key, key));
    // Only the key's own fields: `key` may be a whole TabState.
    return new SettingsBook([...others, { key: AuctionKey.from(key), settings }], {
      currency: settings.currency,
      scopes: this.scopes,
    });
  }

  /** Plain data to store, without the currency (stored on its own: `currency`). */
  toJSON(): SettingsEntryJSON[] {
    return this.entries.map(({ key, settings }) => ({
      ...key,
      settings: settings.perAuction(),
    }));
  }
}
