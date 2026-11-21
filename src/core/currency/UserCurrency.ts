import { isIsoCurrency } from "./codes.ts";

/**
 * The user's currency: the one prices are converted into, one for every
 * auction. Unlike an AuctionCurrency it is never read from a page, so it needs
 * no tokens - any currency the rates API serves will do.
 */
export const UserCurrency = Object.freeze({
  /** Where nothing (valid) is saved. */
  DEFAULT: "EUR",

  /** `code` when it can be a user currency (an ISO 4217 code), else the default. */
  orDefault(code: unknown): string {
    return isIsoCurrency(code) ? code : UserCurrency.DEFAULT;
  },
});
