import { EXCHANGE_RATES_URL } from "../config.ts";
import { Currency } from "../currency/Currency.ts";
import { ExchangeRates } from "./ExchangeRates.ts";

/** The part of `fetch` RatesClient needs. */
type FetchFn = (url: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

/**
 * Loads current exchange rates between the supported currencies. Plain
 * `fetch`, no extension API - the fetch function is injectable for tests.
 */
export class RatesClient {
  readonly fetchFn: FetchFn;
  readonly codes: readonly string[];

  /**
   * @param fetchFn `fetch`, or a stand-in for tests
   * @param codes the currencies to ask for
   */
  constructor(fetchFn: FetchFn = (url) => fetch(url), codes: readonly string[] = Currency.CODES) {
    this.fetchFn = fetchFn;
    this.codes = codes;
  }

  /**
   * URL returning the rates of `base` against every other supported currency.
   */
  urlFor(base: string): string {
    const url = new URL(EXCHANGE_RATES_URL);
    url.searchParams.set("base", base);
    url.searchParams.set("symbols", this.codes.filter((code) => code !== base).join(","));
    return url.toString();
  }

  /**
   * The current rates of `base` against the other supported currencies.
   */
  async fetch(base: string): Promise<ExchangeRates> {
    // Called unbound: `fetch` throws "Illegal invocation" with a foreign `this`.
    const fetchFn = this.fetchFn;
    const response = await fetchFn(this.urlFor(base));
    if (!response.ok) throw new Error(`Exchange rates request failed: HTTP ${response.status}`);
    return ExchangeRates.fromJSON(await response.json(), base, this.codes);
  }
}
