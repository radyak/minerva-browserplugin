/**
 * Exchange rates published for one base currency, and the only place that
 * knows which way they convert. Currencies are ISO codes.
 */

export class ExchangeRates {
  /**
   * @param {string} base currency the rates are relative to
   * @param {string} date day the rates were published (YYYY-MM-DD), "" when unknown
   * @param {Record<string, unknown>} rates 1 `base` = rates[code] `code`; entries that
   *   are not positive finite numbers, or are for `base` itself, are dropped
   */
  constructor(base, date, rates) {
    /** @readonly */
    this.base = base;
    /** @readonly */
    this.date = date;
    /** @type {Record<string, number>} */
    const valid = {};
    for (const [code, rate] of Object.entries(rates)) {
      if (code !== base && typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
        valid[code] = rate;
      }
    }
    /** @readonly */
    this.rates = Object.freeze(valid);
    Object.freeze(this);
  }

  /**
   * No rates at all: only `base` itself (1:1) can be converted.
   * @param {string} base
   */
  static empty(base) {
    return new ExchangeRates(base, "", {});
  }

  /**
   * Rates out of an API response, restricted to `codes`.
   * @param {unknown} json
   * @param {string} base the requested base currency
   * @param {readonly string[]} codes the currencies to keep
   * @returns {ExchangeRates}
   * @throws {Error} when the response does not hold rates for `base`
   */
  static fromJSON(json, base, codes) {
    const response = /** @type {{base?: unknown, date?: unknown, rates?: unknown} | null} */ (json);
    if (response?.base !== base || typeof response.rates !== "object" || response.rates === null) {
      throw new Error(`Unexpected exchange rates response for ${base}`);
    }
    const rates = /** @type {Record<string, unknown>} */ (response.rates);
    const kept = Object.fromEntries(codes.map((code) => [code, rates[code]]));
    return new ExchangeRates(base, String(response.date ?? ""), kept);
  }

  /**
   * Rates as saved by the panel (see `toJSON()`), when they were saved for
   * `base`; anything else - other base, missing, malformed - gives `empty(base)`.
   * @param {unknown} stored
   * @param {string} base
   * @returns {ExchangeRates}
   */
  static fromStorage(stored, base) {
    const saved = /** @type {{base?: unknown, date?: unknown, rates?: unknown} | null} */ (stored);
    if (saved?.base !== base || typeof saved.rates !== "object" || saved.rates === null) {
      return ExchangeRates.empty(base);
    }
    const rates = /** @type {Record<string, unknown>} */ (saved.rates);
    return new ExchangeRates(base, String(saved.date ?? ""), rates);
  }

  /**
   * Factor that converts an amount in `code` into `base`.
   * @param {string | undefined} code
   * @returns {number | undefined} undefined when there is no rate for `code`
   */
  factorFrom(code) {
    if (code === this.base) return 1;
    const rate = code === undefined ? undefined : this.rates[code];
    // 1 base = rate code, so 1 code = 1 / rate base.
    return rate === undefined ? undefined : 1 / rate;
  }

  /**
   * `amount` in `code` converted into `base`.
   * @param {number} amount
   * @param {string | undefined} code
   * @returns {number | undefined} undefined when there is no rate for `code`
   */
  convert(amount, code) {
    const factor = this.factorFrom(code);
    return factor === undefined ? undefined : amount * factor;
  }

  /** @returns {{base: string, date: string, rates: Record<string, number>}} plain data to store */
  toJSON() {
    return { base: this.base, date: this.date, rates: { ...this.rates } };
  }
}
