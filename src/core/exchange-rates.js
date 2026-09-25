import { EXCHANGE_RATES_URL } from "./config.js";
import { CURRENCIES } from "./settings.js";

/**
 * Current exchange rates between the supported currencies. Plain `fetch`, no
 * extension API - the fetch function is injectable for tests.
 */

/**
 * @typedef {object} ExchangeRates
 * @property {string} base currency the rates are relative to
 * @property {string} date day the rates were published (YYYY-MM-DD)
 * @property {Record<string, number>} rates 1 `base` = rates[currency] currency
 */

/**
 * URL returning the rates of `base` against every other supported currency.
 * @param {string} base one of CURRENCIES
 * @returns {string}
 */
export function exchangeRatesUrl(base) {
  const url = new URL(EXCHANGE_RATES_URL);
  url.searchParams.set("base", base);
  url.searchParams.set("symbols", CURRENCIES.filter((c) => c !== base).join(","));
  return url.toString();
}

/**
 * Validate an API response and keep only the supported currencies.
 * @param {unknown} json
 * @param {string} base the requested base currency
 * @returns {ExchangeRates}
 * @throws {Error} when the response does not hold rates for `base`
 */
export function parseExchangeRates(json, base) {
  if (json?.base !== base || typeof json.rates !== "object" || json.rates === null) {
    throw new Error(`Unexpected exchange rates response for ${base}`);
  }
  const rates = {};
  for (const currency of CURRENCIES) {
    const rate = json.rates[currency];
    if (currency !== base && Number.isFinite(rate) && rate > 0) rates[currency] = rate;
  }
  return { base, date: String(json.date ?? ""), rates };
}

/**
 * Load the current rates of `base` against the other supported currencies.
 * @param {string} base one of CURRENCIES
 * @param {typeof fetch} [fetchFn]
 * @returns {Promise<ExchangeRates>}
 */
export async function fetchExchangeRates(base, fetchFn = fetch) {
  const response = await fetchFn(exchangeRatesUrl(base));
  if (!response.ok) throw new Error(`Exchange rates request failed: HTTP ${response.status}`);
  return parseExchangeRates(await response.json(), base);
}
