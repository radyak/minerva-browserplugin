import { EXCHANGE_RATES_URL } from "../config.js";
import { Currency } from "../currency/Currency.js";
import { ExchangeRates } from "./ExchangeRates.js";

/**
 * Loads current exchange rates between the supported currencies. Plain
 * `fetch`, no extension API - the fetch function is injectable for tests.
 */
export class RatesClient {
  /**
   * @param {(url: string) => Promise<Pick<Response, "ok" | "status" | "json">>} [fetchFn]
   * @param {readonly string[]} [codes] the currencies to ask for
   */
  constructor(fetchFn = (url) => fetch(url), codes = Currency.CODES) {
    this.fetchFn = fetchFn;
    this.codes = codes;
  }

  /**
   * URL returning the rates of `base` against every other supported currency.
   * @param {string} base
   * @returns {string}
   */
  urlFor(base) {
    const url = new URL(EXCHANGE_RATES_URL);
    url.searchParams.set("base", base);
    url.searchParams.set("symbols", this.codes.filter((code) => code !== base).join(","));
    return url.toString();
  }

  /**
   * The current rates of `base` against the other supported currencies.
   * @param {string} base
   * @returns {Promise<ExchangeRates>}
   */
  async fetch(base) {
    // Called unbound: `fetch` throws "Illegal invocation" with a foreign `this`.
    const fetchFn = this.fetchFn;
    const response = await fetchFn(this.urlFor(base));
    if (!response.ok) throw new Error(`Exchange rates request failed: HTTP ${response.status}`);
    return ExchangeRates.fromJSON(await response.json(), base, this.codes);
  }
}
