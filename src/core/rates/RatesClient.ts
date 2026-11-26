import { CURRENCIES_URL, EXCHANGE_RATES_URL } from "../config.ts";
import { AuctionCurrency } from "../currency/AuctionCurrency.ts";
import { UserCurrency, type UserCurrencyOption } from "../currency/UserCurrency.ts";
import { ExchangeRates } from "./ExchangeRates.ts";

/** The part of `fetch` RatesClient needs. */
type FetchFn = (url: string) => Promise<Pick<Response, "ok" | "status" | "json">>;

/**
 * Loads the current exchange rates of a user currency (the base) against the
 * auction currencies - the only ones prices can be converted from. Plain
 * `fetch`, no extension API - the fetch function is injectable for tests.
 */
export class RatesClient {
  readonly fetchFn: FetchFn;
  readonly codes: readonly string[];

  /**
   * @param fetchFn `fetch`, or a stand-in for tests
   * @param codes the currencies to ask for: the auction currencies
   */
  constructor(
    fetchFn: FetchFn = (url) => fetch(url),
    codes: readonly string[] = AuctionCurrency.CODES,
  ) {
    this.fetchFn = fetchFn;
    this.codes = codes;
  }

  /**
   * URL returning the rates of `base` against every auction currency.
   */
  urlFor(base: string): string {
    const url = new URL(EXCHANGE_RATES_URL);
    url.searchParams.set("base", base);
    url.searchParams.set("symbols", this.codes.filter((code) => code !== base).join(","));
    return url.toString();
  }

  /**
   * The current rates of `base` against the auction currencies.
   */
  async fetch(base: string): Promise<ExchangeRates> {
    return ExchangeRates.fromJSON(await this.#get(this.urlFor(base)), base, this.codes);
  }

  /**
   * The currencies the API has rates for - the ones a user can pick - sorted by code.
   */
  async currencies(): Promise<UserCurrencyOption[]> {
    return UserCurrency.fromJSON(await this.#get(CURRENCIES_URL));
  }

  /** The JSON answer of `url`; rejects on an HTTP error. */
  async #get(url: string): Promise<unknown> {
    // Called unbound: `fetch` throws "Illegal invocation" with a foreign `this`.
    const fetchFn = this.fetchFn;
    const response = await fetchFn(url);
    if (!response.ok) throw new Error(`Exchange rates request failed: HTTP ${response.status}`);
    return response.json();
  }
}
