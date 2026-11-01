import type { SettingsStore } from "../browser/SettingsStore.ts";
import type { ExchangeRates } from "../core/rates/ExchangeRates.ts";
import { RatesClient } from "../core/rates/RatesClient.ts";
import { Settings } from "../core/settings/Settings.ts";

/** How long fetched rates are reused before asking the API again. */
const CACHE_MS = 60 * 60 * 1000;

type Deps = {
  store: Pick<SettingsStore, "load" | "saveRates">;
  client?: Pick<RatesClient, "fetch">;
  /** current time in ms, injectable for tests */
  now?: () => number;
};

/**
 * The background's exchange rates: the only place that talks to the rates API.
 * Answers the panel (with a short cache, so switching currencies back and
 * forth does not hit the API every time) and keeps the saved rates fresh.
 */
export class RatesService {
  #cache = new Map<string, { rates: ExchangeRates; at: number }>();
  readonly store: Deps["store"];
  readonly client: Pick<RatesClient, "fetch">;
  readonly now: () => number;

  constructor({ store, client = new RatesClient(), now = () => Date.now() }: Deps) {
    this.store = store;
    this.client = client;
    this.now = now;
  }

  /**
   * The current rates of `base`.
   * @param options.fresh skip the cache
   * @throws {Error} when the rates cannot be loaded
   */
  async get(base: string, { fresh = false }: { fresh?: boolean } = {}): Promise<ExchangeRates> {
    const cached = this.#cache.get(base);
    if (!fresh && cached && this.now() - cached.at < CACHE_MS) return cached.rates;
    const rates = await this.client.fetch(base);
    this.#cache.set(base, { rates, at: this.now() });
    return rates;
  }

  /**
   * Replace the saved rates of every currency in use - those of the saved
   * settings and the default one, used where nothing saved applies - with fresh
   * ones. A failure (offline, API down) keeps the saved rates of that currency.
   * @returns the currencies whose fresh rates were saved
   */
  async refreshSaved(): Promise<string[]> {
    const { book } = await this.store.load();
    const refreshed = [];
    for (const base of new Set([Settings.DEFAULT.currency, ...book.currencies()])) {
      try {
        await this.store.saveRates(await this.get(base, { fresh: true }));
        refreshed.push(base);
      } catch (error) {
        console.warn(`[minerva] refreshing the ${base} exchange rates failed:`, error);
      }
    }
    return refreshed;
  }
}
