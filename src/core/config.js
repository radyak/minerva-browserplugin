/**
 * Plugin-wide constants. The auction sites the extension acts on live in
 * ./sites/sites.config.js.
 */

/** Class of the sibling element the extension inserts (see content/content.css). */
export const ANNOTATION_CLASS = "minerva-effective-price";

/** Shown in the sibling element when the target text holds no parsable price. */
export const UNPARSABLE_TEXT = "n/a";

/**
 * Exchange rates API (Frankfurter, ECB reference rates, no key, CORS enabled).
 * Queried as `${EXCHANGE_RATES_URL}?base=EUR&symbols=USD,GBP`.
 */
export const EXCHANGE_RATES_URL = "https://api.frankfurter.dev/v1/latest";
