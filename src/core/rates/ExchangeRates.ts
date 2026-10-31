/** `ExchangeRates#toJSON()`: what is stored and sent in messages. */
export type ExchangeRatesJSON = { base: string; date: string; rates: Record<string, number> };

/**
 * Exchange rates published for one base currency, and the only place that
 * knows which way they convert. Currencies are ISO codes.
 */
export class ExchangeRates {
  readonly base: string;
  readonly date: string;
  readonly rates: Readonly<Record<string, number>>;

  /**
   * @param base currency the rates are relative to
   * @param date day the rates were published (YYYY-MM-DD), "" when unknown
   * @param rates 1 `base` = rates[code] `code`; entries that
   *   are not positive finite numbers, or are for `base` itself, are dropped
   */
  constructor(base: string, date: string, rates: Record<string, unknown>) {
    this.base = base;
    this.date = date;

    const valid: Record<string, number> = {};
    for (const [code, rate] of Object.entries(rates)) {
      if (code !== base && typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
        valid[code] = rate;
      }
    }
    this.rates = Object.freeze(valid);
    Object.freeze(this);
  }

  /**
   * No rates at all: only `base` itself (1:1) can be converted.
   */
  static empty(base: string) {
    return new ExchangeRates(base, "", {});
  }

  /**
   * Rates out of an API response, restricted to `codes`.
   * @param base the requested base currency
   * @param codes the currencies to keep
   * @throws {Error} when the response does not hold rates for `base`
   */
  static fromJSON(json: unknown, base: string, codes: readonly string[]): ExchangeRates {
    const response = json as { base?: unknown; date?: unknown; rates?: unknown } | null;
    if (response?.base !== base || typeof response.rates !== "object" || response.rates === null) {
      throw new Error(`Unexpected exchange rates response for ${base}`);
    }
    const rates = response.rates as Record<string, unknown>;
    const kept = Object.fromEntries(codes.map((code) => [code, rates[code]]));
    return new ExchangeRates(base, String(response.date ?? ""), kept);
  }

  /**
   * Rates as saved by the panel (see `toJSON()`), when they were saved for
   * `base`; anything else - other base, missing, malformed - gives `empty(base)`.
   */
  static fromStorage(stored: unknown, base: string): ExchangeRates {
    const saved = stored as { base?: unknown; date?: unknown; rates?: unknown } | null;
    if (saved?.base !== base || typeof saved.rates !== "object" || saved.rates === null) {
      return ExchangeRates.empty(base);
    }
    const rates = saved.rates as Record<string, unknown>;
    return new ExchangeRates(base, String(saved.date ?? ""), rates);
  }

  /**
   * Factor that converts an amount in `code` into `base`.
   * @returns undefined when there is no rate for `code`
   */
  factorFrom(code: string | undefined): number | undefined {
    if (code === this.base) return 1;
    const rate = code === undefined ? undefined : this.rates[code];
    // 1 base = rate code, so 1 code = 1 / rate base.
    return rate === undefined ? undefined : 1 / rate;
  }

  /**
   * `amount` in `code` converted into `base`.
   * @returns undefined when there is no rate for `code`
   */
  convert(amount: number, code: string | undefined): number | undefined {
    const factor = this.factorFrom(code);
    return factor === undefined ? undefined : amount * factor;
  }

  /** Plain data to store. */
  toJSON(): ExchangeRatesJSON {
    return { base: this.base, date: this.date, rates: { ...this.rates } };
  }
}
