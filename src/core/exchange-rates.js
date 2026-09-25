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
 * Factor per input currency that converts an amount into the output currency:
 * `amount * rates[input]`. A currency without an entry cannot be converted.
 * @typedef {Record<string, number>} ConversionRates
 */

/** browser.storage.local key of the ExchangeRates saved with the currency. */
export const EXCHANGE_RATES_STORAGE_KEY = "settings.exchangeRates";

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

/**
 * Conversion rates into `currency`, derived from rates published for it
 * (`exchangeRates.base === currency`). The output currency itself always
 * converts 1:1; everything else is missing when no matching rates are given.
 * @param {ExchangeRates | null | undefined} exchangeRates
 * @param {string} currency the output currency
 * @returns {ConversionRates}
 */
export function conversionRates(exchangeRates, currency) {
  const result = { [currency]: 1 };
  if (exchangeRates?.base !== currency || typeof exchangeRates.rates !== "object") return result;
  for (const [code, rate] of Object.entries(exchangeRates.rates ?? {})) {
    // 1 currency = rate code, so 1 code = 1 / rate currency.
    if (code !== currency && Number.isFinite(rate) && rate > 0) result[code] = 1 / rate;
  }
  return result;
}
