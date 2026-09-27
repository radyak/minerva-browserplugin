/**
 * Single source of truth for everything the extension is supposed to act on:
 * the auction sites in PLATFORMS and the plugin-wide constants below. Both the
 * manifests (build time) and the runtime code read from here, so a change only
 * has to happen in this file.
 */

/**
 * @typedef {object} Platform
 * @property {string} platformUrl Protocol + host of the site, optionally with a
 *   port, no path (e.g. "https://www.biddr.com"). scripts/build.mjs turns it
 *   into the content script match pattern "<protocol>//<host>/*".
 * @property {string[]} platformPaths Path globs on that host (e.g. "/live/*").
 *   The content script only acts while the page path matches one of them;
 *   query and hash are ignored. "*" matches any run of characters, without it
 *   the path must match exactly.
 * @property {string[]} targetSelectors CSS selectors of the elements whose text
 *   content holds the price.
 */

/**
 * Every site the extension acts on. On a given URL the first platform on the
 * same origin with a matching entry in `platformPaths` wins.
 * @type {Platform[]}
 */
export const PLATFORMS = [
  {
    platformUrl: "https://www.biddr.com",
    platformPaths: ["/*"],
    targetSelectors: [".current-bid", ".lot-price div:last-child span:first-child"],
  },
  {
    platformUrl: "https://www.numisbids.com",
    platformPaths: ["/sale/*"],
    targetSelectors: [".rateclick"],
  },
];

/** Class of the sibling element the extension inserts (see content/content.css). */
export const ANNOTATION_CLASS = "xbp-price-markup";

/** Shown in the sibling element when the target text holds no parsable price. */
export const UNPARSABLE_TEXT = "n/a";

/**
 * Exchange rates API (Frankfurter, ECB reference rates, no key, CORS enabled).
 * Queried as `${EXCHANGE_RATES_URL}?base=EUR&symbols=USD,GBP`.
 */
export const EXCHANGE_RATES_URL = "https://api.frankfurter.dev/v1/latest";
