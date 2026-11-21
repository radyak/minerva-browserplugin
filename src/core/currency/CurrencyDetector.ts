import { escapeRegExp } from "../regexp.ts";
import { Currency } from "./Currency.ts";

export interface CurrencyMatch {
  /** ISO code ("EUR") */
  code: string;
  /** the text it was written as ("€", "EUR", "US$") */
  token: string;
  /** position of `token` in the searched text */
  index: number;
}

/**
 * Finds the currency next to a number in page text. A token must not be part
 * of a word: where it starts or ends with a letter, no letter may come right
 * before or after it ("EURO" is no EUR, "Kft." holds no "Ft"). Digits may
 * touch it ("€49.99", "500EUR", "500Ft").
 */
export class CurrencyDetector {
  /** token -> ISO code */
  readonly codeOf: Map<string, string>;
  readonly pattern: RegExp;

  constructor(currencies: readonly Currency[] = Currency.ALL) {
    this.codeOf = new Map(
      currencies.flatMap((currency) => currency.tokens.map((token) => [token, currency.code])),
    );
    // Longest first, so "US$" wins over "$" and "SFr." over "Fr.".
    const tokens = [...this.codeOf.keys()].sort((a, b) => b.length - a.length);
    this.pattern = new RegExp(tokens.map(tokenSource).join("|"), "gu");
  }

  /**
   * The currency in `text` closest to the number: the last one when `text` is
   * the part before the number, the first one when it is the part after it.
   */
  find(text: string, side: "before" | "after"): CurrencyMatch | null {
    const matches = [...text.matchAll(this.pattern)];
    const match = side === "before" ? matches.at(-1) : matches[0];
    if (!match) return null;
    return { code: this.codeOf.get(match[0])!, token: match[0], index: match.index };
  }
}

const LETTER = /^\p{L}$/u;

/** RegExp source of `token`, guarded against letters where it has a letter at its edge. */
function tokenSource(token: string): string {
  const chars = [...token];
  const before = LETTER.test(chars[0]!) ? "(?<!\\p{L})" : "";
  const after = LETTER.test(chars.at(-1)!) ? "(?!\\p{L})" : "";
  return before + escapeRegExp(token) + after;
}
