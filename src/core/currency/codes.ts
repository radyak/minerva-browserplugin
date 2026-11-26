/**
 * ISO 4217 currency codes in general - for any currency, whether the plugin
 * can detect it on a page (AuctionCurrency) or not.
 */

/** Is `token` written as a three letter ISO code ("EUR") rather than a symbol ("€")? */
export function isCurrencyCode(token: string): boolean {
  return /^[A-Z]{3}$/.test(token);
}

let known: ReadonlySet<string> | null = null;

/**
 * Is `code` a current ISO 4217 currency code, as far as the browser knows
 * (`Intl.supportedValuesOf`)? Guards stored and received codes; which ones the
 * rates API serves is a question for the API.
 */
export function isIsoCurrency(code: unknown): code is string {
  known ??= new Set(Intl.supportedValuesOf("currency"));
  return typeof code === "string" && known.has(code);
}

/**
 * The standard decimal places of `code` (ISO 4217, via `Intl`): 0 for JPY,
 * 2 for most; 2 for anything that is no currency code.
 */
export function standardDecimals(code: string | undefined): number {
  if (code === undefined || !isCurrencyCode(code)) return 2;
  try {
    const format = new Intl.NumberFormat("en", { style: "currency", currency: code });
    return format.resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    return 2;
  }
}
