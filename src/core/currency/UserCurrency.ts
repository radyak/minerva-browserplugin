import { AuctionCurrency } from "./AuctionCurrency.ts";
import { isIsoCurrency } from "./codes.ts";

/** A currency the user can pick, as listed in the panel. */
export type UserCurrencyOption = { code: string; name: string };

/**
 * The user's currency: the one prices are converted into, one for every
 * auction. Unlike an AuctionCurrency it is never read from a page, so it needs
 * no tokens - the list to pick from comes from the rates API (see
 * `RatesClient#currencies()`).
 */
export const UserCurrency = Object.freeze({
  /** Where nothing (valid) is saved. */
  DEFAULT: "EUR",

  /** `code` when it can be a user currency (an ISO 4217 code), else the default. */
  orDefault(code: unknown): string {
    return isIsoCurrency(code) ? code : UserCurrency.DEFAULT;
  },

  /** The English name of `code` ("Swiss Franc"); the code when the browser knows none. */
  nameOf(code: string): string {
    try {
      return new Intl.DisplayNames(["en"], { type: "currency" }).of(code) ?? code;
    } catch {
      return code;
    }
  },

  /**
   * The currencies of the API's answer (`{ [code]: name }`), sorted by code;
   * entries that are no ISO code or have no name are dropped.
   * @throws {Error} when no currency is left
   */
  fromJSON(json: unknown): UserCurrencyOption[] {
    const entries = typeof json === "object" && json !== null ? Object.entries(json) : [];
    const options = entries
      .filter(([code, name]) => isIsoCurrency(code) && typeof name === "string" && name !== "")
      .map(([code, name]) => ({ code, name: name as string }));
    if (!options.length) throw new Error("Unexpected currencies response");
    return byCode(options);
  },

  /**
   * What to offer without the API's list: the auction currencies and `codes`
   * (the saved currency, so it stays selectable), sorted by code.
   */
  fallback(...codes: string[]): UserCurrencyOption[] {
    const all = new Set([...AuctionCurrency.CODES, ...codes.filter((code) => isIsoCurrency(code))]);
    return byCode([...all].map((code) => ({ code, name: UserCurrency.nameOf(code) })));
  },

  /** `options` with `code` added (named by the browser) unless it is there. */
  including(options: readonly UserCurrencyOption[], code: string): UserCurrencyOption[] {
    if (options.some((option) => option.code === code)) return [...options];
    return byCode([...options, { code, name: UserCurrency.nameOf(code) }]);
  },
});

function byCode(options: UserCurrencyOption[]): UserCurrencyOption[] {
  return options.sort((a, b) => a.code.localeCompare(b.code));
}
