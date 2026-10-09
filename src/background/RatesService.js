import { RatesClient } from "../core/rates/RatesClient.js";
import { Settings } from "../core/settings/Settings.js";

/** How long fetched rates are reused before asking the API again. */
const CACHE_MS = 60 * 60 * 1000;

/** @typedef {import("../core/rates/ExchangeRates.js").ExchangeRates} ExchangeRates */

/**
 * The background's exchange rates: the only place that talks to the rates API.
 * Answers the panel (with a short cache, so switching currencies back and
 * forth does not hit the API every time) and keeps the saved rates fresh.
 */
export class RatesService {
  /** @type {Map<string, {rates: ExchangeRates, at: number}>} */
  #cache = new Map();

  /**
   * @param {object} deps
   * @param {Pick<import("../browser/SettingsStore.js").SettingsStore, "load" | "saveRates">} deps.store
   * @param {Pick<RatesClient, "fetch">} [deps.client]
   * @param {() => number} [deps.now] current time in ms, injectable for tests
   */
  constructor({ store, client = new RatesClient(), now = () => Date.now() }) {
    this.store = store;
    this.client = client;
    this.now = now;
  }

  /**
   * The current rates of `base`.
   * @param {string} base
   * @param {object} [options]
   * @param {boolean} [options.fresh] skip the cache
   * @returns {Promise<ExchangeRates>}
   * @throws {Error} when the rates cannot be loaded
   */
  async get(base, { fresh = false } = {}) {
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
   * @returns {Promise<string[]>} the currencies whose fresh rates were saved
   */
  async refreshSaved() {
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
