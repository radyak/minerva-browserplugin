/**
 * Currency detection in the text around a price, and the notation used to
 * write a price in another currency.
 */

/**
 * Tokens recognised as a currency, longest first so "US$" wins over "$".
 * Codes must stand on their own ("EURO" is no match), symbols may touch the
 * number ("€49.99", "500EUR").
 */
const TOKENS = [
  ["US$", "USD"],
  ["SFr.", "CHF"],
  ["Fr.", "CHF"],
  ["EUR", "EUR"],
  ["USD", "USD"],
  ["GBP", "GBP"],
  ["CHF", "CHF"],
  ["€", "EUR"],
  ["$", "USD"],
  ["£", "GBP"],
];

/** Symbol to write when the input used a symbol rather than a code. */
const SYMBOLS = { EUR: "€", USD: "$", GBP: "£", CHF: "CHF" };

const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const TOKEN_RE = new RegExp(
  TOKENS.map(([token]) => (/^[A-Z]{3}$/.test(token) ? `(?<![A-Za-z])${token}(?![A-Za-z])` : escape(token)))
    .join("|"),
  "g",
);
const CODE_OF = new Map(TOKENS);

/**
 * @typedef {object} CurrencyMatch
 * @property {string} code  ISO code ("EUR")
 * @property {string} token the text it was written as ("€", "EUR", "US$")
 * @property {number} index position of `token` in the searched text
 */

/**
 * The currency in `text` closest to the number: the last one when `text` is
 * the part before the number, the first one when it is the part after it.
 * @param {string} text
 * @param {"before" | "after"} side
 * @returns {CurrencyMatch | null}
 */
export function findCurrency(text, side) {
  const matches = [...text.matchAll(TOKEN_RE)];
  const match = side === "before" ? matches.at(-1) : matches[0];
  if (!match) return null;
  return { code: CODE_OF.get(match[0]), token: match[0], index: match.index };
}

/**
 * How to write `code` in place of `token`: as a symbol when the input used one,
 * as the code otherwise.
 * @param {string} token
 * @param {string} code
 * @returns {string}
 */
export function currencyNotation(token, code) {
  return /^[A-Z]{3}$/.test(token) ? code : (SYMBOLS[code] ?? code);
}
