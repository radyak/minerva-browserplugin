import { isCurrencyCode, standardDecimals } from "./codes.ts";

/**
 * A currency auction prices can be in, with everything needed to recognise it
 * in page text and to write it. `AuctionCurrency.ALL` is the hand-picked list
 * of them - adding one means adding one entry there. Not to be confused with
 * the user's currency (UserCurrency), which results are converted into and
 * which can be any currency the rates API serves.
 */
export class AuctionCurrency {
  readonly code: string;
  readonly symbol: string;
  readonly tokens: readonly string[];
  readonly decimals: number;

  /**
   * @param code ISO 4217 code ("EUR")
   * @param symbol written instead of the code when the input used a symbol
   * @param tokens how the currency may be written in page text
   * @param decimals decimal places amounts are written with (JPY: 0)
   */
  constructor(code: string, symbol: string, tokens: string[], decimals = 2) {
    this.code = code;
    this.symbol = symbol;
    this.tokens = Object.freeze([...tokens]);
    this.decimals = decimals;
    Object.freeze(this);
  }

  /**
   * The auction currency with this ISO code.
   */
  static of(code: unknown): AuctionCurrency | null {
    return AuctionCurrency.ALL.find((currency) => currency.code === code) ?? null;
  }

  /**
   * Decimal places amounts in `code` are written with: an auction currency's
   * own, else the standard ones (`standardDecimals()`).
   */
  static decimalsOf(code: string | undefined): number {
    return AuctionCurrency.of(code)?.decimals ?? standardDecimals(code);
  }

  /**
   * How to write this currency in place of `token`: as a symbol when the
   * input used one, as the code otherwise.
   */
  notationFor(token: string): string {
    return isCurrencyCode(token) ? this.code : this.symbol;
  }

  static EUR = new AuctionCurrency("EUR", "€", ["EUR", "€"]);
  static USD = new AuctionCurrency("USD", "$", ["USD", "US$", "$"]);
  static GBP = new AuctionCurrency("GBP", "£", ["GBP", "£"]);
  static CHF = new AuctionCurrency("CHF", "CHF", ["CHF", "SFr.", "Fr."]);
  // A bare "$" stays USD: the other dollars only by their prefixed symbols.
  static CAD = new AuctionCurrency("CAD", "C$", ["CAD", "C$", "CA$"]);
  static AUD = new AuctionCurrency("AUD", "A$", ["AUD", "A$", "AU$"]);
  static NZD = new AuctionCurrency("NZD", "NZ$", ["NZD", "NZ$"]);
  // "￥" is the full-width sign of Japanese pages.
  static JPY = new AuctionCurrency("JPY", "¥", ["JPY", "¥", "￥"], 0);
  // The krone/krona are only read by their codes: "kr" alone could be any of them.
  static DKK = new AuctionCurrency("DKK", "DKK", ["DKK"]);
  static SEK = new AuctionCurrency("SEK", "SEK", ["SEK"]);
  static NOK = new AuctionCurrency("NOK", "NOK", ["NOK"]);
  static CZK = new AuctionCurrency("CZK", "Kč", ["CZK", "Kč"]);
  static PLN = new AuctionCurrency("PLN", "zł", ["PLN", "zł"]);
  // ISO 4217 gives the forint 2 decimals, but prices are written without them.
  static HUF = new AuctionCurrency("HUF", "Ft", ["HUF", "Ft"], 0);

  /** Every auction currency. */
  static ALL = Object.freeze([
    AuctionCurrency.EUR,
    AuctionCurrency.USD,
    AuctionCurrency.GBP,
    AuctionCurrency.CHF,
    AuctionCurrency.CAD,
    AuctionCurrency.AUD,
    AuctionCurrency.NZD,
    AuctionCurrency.JPY,
    AuctionCurrency.DKK,
    AuctionCurrency.SEK,
    AuctionCurrency.NOK,
    AuctionCurrency.CZK,
    AuctionCurrency.PLN,
    AuctionCurrency.HUF,
  ]);

  /** The ISO codes of `AuctionCurrency.ALL`, in the same order. */
  static CODES = Object.freeze(AuctionCurrency.ALL.map((currency) => currency.code));
}
