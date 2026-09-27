import { RatesClient } from "../core/rates/RatesClient.js";

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
   * Replace the saved rates with fresh ones for the saved currency. Failures
   * (offline, API down) keep the saved rates.
   * @returns {Promise<boolean>} whether fresh rates were saved
   */
  async refreshSaved() {
    try {
      const { settings } = await this.store.load();
      const rates = await this.get(settings.currency, { fresh: true });
      // The currency may have been changed while the request was running.
      const { settings: current } = await this.store.load();
      if (current.currency !== rates.base) return false;
      await this.store.saveRates(rates);
      return true;
    } catch (error) {
      console.warn("[minerva] refreshing the exchange rates failed:", error);
      return false;
    }
  }
}
