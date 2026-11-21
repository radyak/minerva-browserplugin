import type { SettingsStore } from "../browser/SettingsStore.ts";
import type { ExchangeRates } from "../core/rates/ExchangeRates.ts";
import type { UserCurrencyOption } from "../core/currency/UserCurrency.ts";
import { RatesClient } from "../core/rates/RatesClient.ts";

/** How long fetched rates are reused before asking the API again. */
const CACHE_MS = 60 * 60 * 1000;
/** How long the list of currencies is reused: it changes once in years. */
const CURRENCIES_CACHE_MS = 24 * 60 * 60 * 1000;

type Deps = {
  store: Pick<SettingsStore, "load" | "saveRates">;
  client?: Pick<RatesClient, "fetch" | "currencies">;
  /** current time in ms, injectable for tests */
  now?: () => number;
};

/**
 * The background's exchange rates: the only place that talks to the rates API.
 * Answers the panel (with a short cache, so switching currencies back and
 * forth does not hit the API every time) - rates and the currencies the user
 * can pick - and keeps the saved rates fresh.
 */
export class RatesService {
  #cache = new Map<string, { rates: ExchangeRates; at: number }>();
  #currencies: { list: UserCurrencyOption[]; at: number } | null = null;
  readonly #deps: Required<Deps>;

  constructor(deps: Deps) {
    this.#deps = { client: new RatesClient(), now: () => Date.now(), ...deps };
  }

  /**
   * The current rates of `base`.
   * @param options.fresh skip the cache
   * @throws {Error} when the rates cannot be loaded
   */
  async get(base: string, { fresh = false }: { fresh?: boolean } = {}): Promise<ExchangeRates> {
    const { client, now } = this.#deps;
    const cached = this.#cache.get(base);
    if (!fresh && cached && now() - cached.at < CACHE_MS) return cached.rates;
    const rates = await client.fetch(base);
    this.#cache.set(base, { rates, at: now() });
    return rates;
  }

  /**
   * The currencies the API has rates for: the ones the user can pick.
   * @throws {Error} when the list cannot be loaded
   */
  async currencies(): Promise<UserCurrencyOption[]> {
    const { client, now } = this.#deps;
    const cached = this.#currencies;
    if (cached && now() - cached.at < CURRENCIES_CACHE_MS) return cached.list;
    const list = await client.currencies();
    this.#currencies = { list, at: now() };
    return list;
  }

  /**
   * Replace the saved rates of the user's currency (the default one until a
   * currency is saved) with fresh ones. A failure (offline, API down) keeps the
   * saved rates.
   * @returns the currencies whose fresh rates were saved
   */
  async refreshSaved(): Promise<string[]> {
    const { store } = this.#deps;
    const { currency } = (await store.load()).book;
    try {
      await store.saveRates(await this.get(currency, { fresh: true }));
      return [currency];
    } catch (error) {
      console.warn(`[minerva] refreshing the ${currency} exchange rates failed:`, error);
      return [];
    }
  }
}
