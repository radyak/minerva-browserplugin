import type { ExchangeRates } from "../core/rates/ExchangeRates.ts";

/**
 * The exchange rates of the currency selected in the panel. A new load
 * supersedes the previous one, so fast currency switches never end with
 * stale rates on screen or in storage.
 */
export class SelectedRates {
  #latest = 0;

  #selected: Promise<ExchangeRates | null> = Promise.resolve(null);
  fetchRates: (code: string) => Promise<ExchangeRates>;

  /** @param fetchRates rejects when unavailable */
  constructor(fetchRates: (code: string) => Promise<ExchangeRates>) {
    this.fetchRates = fetchRates;
  }

  /**
   * Load the rates of `code`, superseding any earlier load.
   * @returns `rates` is null when
   *   loading failed; `latest` is false when another load started in the meantime
   */
  async load(code: string): Promise<{ rates: ExchangeRates | null; latest: boolean }> {
    const request = ++this.#latest;
    this.#selected = this.fetchRates(code).catch(() => null);
    const rates = await this.#selected;
    return { rates, latest: request === this.#latest };
  }

  /**
   * The rates of the latest load, when they are for `code` - null when that
   * load failed or was for another currency.
   */
  async ratesFor(code: string): Promise<ExchangeRates | null> {
    const rates = await this.#selected;
    return rates?.base === code ? rates : null;
  }
}
