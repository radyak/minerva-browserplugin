import { RatesClient } from "../core/rates/RatesClient.js";

/** @typedef {import("../core/rates/ExchangeRates.js").ExchangeRates} ExchangeRates */

/**
 * Loads exchange rates for the currency selected in the panel. A new load
 * supersedes the previous one, so fast currency switches never end with
 * stale rates on screen or in storage.
 */
export class RatesService {
  #latest = 0;
  /** @type {Promise<ExchangeRates | null>} */
  #selected = Promise.resolve(null);

  /** @param {Pick<RatesClient, "fetch">} [client] */
  constructor(client = new RatesClient()) {
    this.client = client;
  }

  /**
   * Load the rates of `code`, superseding any earlier load.
   * @param {string} code
   * @returns {Promise<{rates: ExchangeRates | null, latest: boolean}>} `rates` is null when
   *   loading failed; `latest` is false when another load started in the meantime
   */
  async load(code) {
    const request = ++this.#latest;
    this.#selected = this.client.fetch(code).catch(() => null);
    const rates = await this.#selected;
    return { rates, latest: request === this.#latest };
  }

  /**
   * The rates of the latest load, when they are for `code` - null when that
   * load failed or was for another currency.
   * @param {string} code
   * @returns {Promise<ExchangeRates | null>}
   */
  async ratesFor(code) {
    const rates = await this.#selected;
    return rates?.base === code ? rates : null;
  }
}
