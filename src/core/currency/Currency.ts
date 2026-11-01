/**
 * A supported currency with everything needed to recognise it in page text
 * and to write it. `Currency.ALL` is the one list of supported currencies -
 * adding a currency means adding one entry there.
 */
export class Currency {
  readonly code: string;
  readonly symbol: string;
  readonly tokens: readonly string[];

  /**
   * @param code ISO 4217 code ("EUR")
   * @param symbol written instead of the code when the input used a symbol
   * @param tokens how the currency may be written in page text
   */
  constructor(code: string, symbol: string, tokens: string[]) {
    this.code = code;
    this.symbol = symbol;
    this.tokens = Object.freeze([...tokens]);
    Object.freeze(this);
  }

  /**
   * Is `token` written as a three letter ISO code ("EUR") rather than a symbol ("€")?
   */
  static isCode(token: string): boolean {
    return /^[A-Z]{3}$/.test(token);
  }

  /**
   * The supported currency with this ISO code.
   */
  static of(code: unknown): Currency | null {
    return Currency.ALL.find((currency) => currency.code === code) ?? null;
  }

  /**
   * How to write this currency in place of `token`: as a symbol when the
   * input used one, as the code otherwise.
   */
  notationFor(token: string): string {
    return Currency.isCode(token) ? this.code : this.symbol;
  }

  static EUR = new Currency("EUR", "€", ["EUR", "€"]);
  static USD = new Currency("USD", "$", ["USD", "US$", "$"]);
  static GBP = new Currency("GBP", "£", ["GBP", "£"]);
  static CHF = new Currency("CHF", "CHF", ["CHF", "SFr.", "Fr."]);

  /** Every supported currency; the first one is the default. */
  static ALL = Object.freeze([Currency.EUR, Currency.USD, Currency.GBP, Currency.CHF]);

  /** The ISO codes of `Currency.ALL`, in the same order. */
  static CODES = Object.freeze(Currency.ALL.map((currency) => currency.code));
}
