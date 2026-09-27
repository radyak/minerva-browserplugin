import { Currency } from "./Currency.js";

/**
 * @typedef {object} CurrencyMatch
 * @property {string} code  ISO code ("EUR")
 * @property {string} token the text it was written as ("€", "EUR", "US$")
 * @property {number} index position of `token` in the searched text
 */

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Finds the currency next to a number in page text. Codes must stand on their
 * own ("EURO" is no match), symbols may touch the number ("€49.99", "500EUR").
 */
export class CurrencyDetector {
  /** @param {readonly Currency[]} [currencies] */
  constructor(currencies = Currency.ALL) {
    /** @type {Map<string, string>} token -> ISO code */
    this.codeOf = new Map(
      currencies.flatMap((currency) => currency.tokens.map((token) => [token, currency.code])),
    );
    // Longest first, so "US$" wins over "$" and "SFr." over "Fr.".
    const tokens = [...this.codeOf.keys()].sort((a, b) => b.length - a.length);
    this.pattern = new RegExp(
      tokens
        .map((token) =>
          Currency.isCode(token) ? `(?<![A-Za-z])${token}(?![A-Za-z])` : escape(token),
        )
        .join("|"),
      "g",
    );
  }

  /**
   * The currency in `text` closest to the number: the last one when `text` is
   * the part before the number, the first one when it is the part after it.
   * @param {string} text
   * @param {"before" | "after"} side
   * @returns {CurrencyMatch | null}
   */
  find(text, side) {
    const matches = [...text.matchAll(this.pattern)];
    const match = side === "before" ? matches.at(-1) : matches[0];
    if (!match) return null;
    return { code: this.codeOf.get(match[0]), token: match[0], index: match.index };
  }
}
