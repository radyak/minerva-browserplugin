import { Currency } from "./currency/Currency.ts";
import { CurrencyDetector, type CurrencyMatch } from "./currency/CurrencyDetector.ts";

/**
 * Parsing, converting and re-formatting of prices found in page text.
 *
 * The goal is to give the result back in the same shape it came in: same
 * currency position, same decimal and grouping separators, same surrounding
 * text. With +20%: "500 EUR" -> "600 EUR", "USD 1.359" -> "USD 1.630,80".
 * Only the currency itself is swapped when the result is in another one.
 */

/**
 * First number in the string, including grouping characters (".", ",", "'", space,
 * narrow no-break space U+202F and no-break space U+00A0).
 */
const NUMBER_RE = /-?\d(?:[\d.,\u202f\u00a0 ']*\d)?/;

/** An innermost bracketed aside with the whitespace before it: " (20)", "[est.]". */
const ASIDE_RE = /\s*(?:\([^()]*\)|\[[^[\]]*\]|\{[^{}]*\})/g;

/**
 * `text` without its bracketed asides - a bid count, an estimate, a
 * conversion ("1'200 EUR (20)", "GBP 500 (approx. 580 EUR)") is never the
 * price itself. Nested brackets go from the inside out. A text that is nothing
 * but an aside ("(500 EUR)") is kept as it is.
 */
function withoutAsides(text: string): string {
  let stripped = text;
  for (let previous; previous !== stripped;) {
    previous = stripped;
    stripped = stripped.replace(ASIDE_RE, "");
  }
  stripped = stripped.trim();
  return NUMBER_RE.test(stripped) ? stripped : text;
}

/**
 * Work out which of "." and "," separates the decimals.
 * Returns null when the number carries no decimals at all.
 */
function detectDecimalSeparator(raw: string): string | null {
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    // Both present: the rightmost one is the decimal separator ("1.234,56").
    return lastComma > lastDot ? "," : ".";
  }

  const separator = lastComma !== -1 ? "," : lastDot !== -1 ? "." : null;
  if (separator === null) return null;

  const occurrences = raw.split(separator).length - 1;
  const trailingDigits = raw.length - raw.lastIndexOf(separator) - 1;
  // A single separator followed by exactly three digits is grouping by
  // convention ("USD 1.359" is one thousand three hundred fifty nine).
  if (occurrences > 1 || trailingDigits === 3) return null;
  return separator;
}

/** Which character groups the thousands, if any is used at all. */
function detectGroupSeparator(raw: string, decimalSeparator: string | null): string | null {
  const used = new Set(raw.match(/[.,\u202f\u00a0 ']/g) ?? []);
  if (decimalSeparator) used.delete(decimalSeparator);
  const [separator] = used;
  return separator ?? null;
}

export interface ParsedPrice {
  /** numeric value */
  amount: number;
  /** decimals the input carried */
  decimals: number;
  /** separator to use when formatting */
  decimalSeparator: string;
  /** separator to use, null = no grouping */
  groupSeparator: string | null;
  /** text before the number ("USD ", "Preis: €") */
  prefix: string;
  /** text after the number (" EUR") */
  suffix: string;
  /** currency found next to the number */
  currency: PriceCurrency | null;
  /** the trimmed input */
  raw: string;
}

/** `index` is the position of the token inside `prefix` or `suffix`. */
export type PriceCurrency = CurrencyMatch & { side: "prefix" | "suffix" };

const detector = new CurrencyDetector();

/**
 * The currency closest to the number, before it or else after it.
 */
function detectCurrency(prefix: string, suffix: string): PriceCurrency | null {
  const before = detector.find(prefix, "before");
  if (before) return { ...before, side: "prefix" };
  const after = detector.find(suffix, "after");
  return after ? { ...after, side: "suffix" } : null;
}

/**
 * Parse a price out of arbitrary text. Bracketed asides are not part of it:
 * they are skipped when looking for the number and left out of prefix and
 * suffix, so they do not show up in the output either.
 * @returns null when no number could be found
 */
export function parsePrice(text: string): ParsedPrice | null {
  if (typeof text !== "string") return null;
  const raw = withoutAsides(text.replace(/\s+/g, " ").trim());
  const match = raw.match(NUMBER_RE);
  if (!match) return null;

  const rawNumber = match[0];
  const decimalSeparator = detectDecimalSeparator(rawNumber);
  const groupSeparator = detectGroupSeparator(rawNumber, decimalSeparator);

  let digits = rawNumber;
  if (groupSeparator) digits = digits.split(groupSeparator).join("");
  if (decimalSeparator) digits = digits.replace(decimalSeparator, ".");

  const amount = Number(digits);
  if (!Number.isFinite(amount)) return null;

  const decimals = decimalSeparator ? digits.length - digits.indexOf(".") - 1 : 0;
  const prefix = raw.slice(0, match.index);
  const suffix = raw.slice(match.index! + rawNumber.length);

  return {
    amount,
    decimals,
    // Without decimals in the input, mirror the grouping style: "1.359" is
    // German-ish, so its decimals are written with a comma.
    decimalSeparator: decimalSeparator ?? (groupSeparator === "." ? "," : "."),
    groupSeparator,
    prefix,
    suffix,
    currency: detectCurrency(prefix, suffix),
    raw,
  };
}

/** Group the integer part in blocks of three. */
function group(integerPart: string, separator: string | null): string {
  if (!separator) return integerPart;
  const sign = integerPart.startsWith("-") ? "-" : "";
  const digits = sign ? integerPart.slice(1) : integerPart;
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Prefix and suffix of `price` with its currency replaced by `currency`.
 * A symbol touching the number that turns into a code gets a space ("€5" ->
 * "CHF 5"), everything else keeps its spacing.
 */
function swapCurrency(
  price: ParsedPrice,
  currency: string | undefined,
): { prefix: string; suffix: string } {
  let { prefix, suffix } = price;
  if (!currency || !price.currency || price.currency.code === currency) return { prefix, suffix };

  const { token, index, side } = price.currency;
  let notation = Currency.of(currency)?.notationFor(token) ?? currency;
  const spaced = Currency.isCode(notation) && !Currency.isCode(token);
  if (side === "prefix") {
    if (spaced && index + token.length === prefix.length) notation += " ";
    prefix = prefix.slice(0, index) + notation + prefix.slice(index + token.length);
  } else {
    if (spaced && index === 0) notation = ` ${notation}`;
    suffix = suffix.slice(0, index) + notation + suffix.slice(index + token.length);
  }
  return { prefix, suffix };
}

/**
 * Render a value the way the parsed price was written.
 * @param currency currency `value` is in, when it differs from the
 *   one written in `price`
 */
export function formatPrice(value: number, price: ParsedPrice, currency?: string): string {
  const rounded = Math.round(value * 100) / 100;
  // Keep it integer only when the input was integer and nothing was lost.
  const decimals = price.decimals === 0 && Number.isInteger(rounded) ? 0 : 2;
  const [integerPart, decimalPart] = rounded.toFixed(decimals).split(".");

  const number = group(integerPart!, price.groupSeparator);
  const formatted = decimalPart ? number + price.decimalSeparator + decimalPart : number;
  const { prefix, suffix } = swapCurrency(price, currency);
  return prefix + formatted + suffix;
}

/**
 * Parse `text`, run its amount and currency through `calculate` and render the
 * result in the same style.
 * @param calculate `currency` is the ISO code found in `text`; returning
 *   undefined means the result cannot be determined
 * @param currency currency the result of `calculate` is in
 * @returns null when `text` holds no price or there is no result
 */
export function convertPrice(
  text: string,
  calculate: (amount: number, currency: string | undefined) => number | undefined,
  currency?: string,
): string | null {
  const price = parsePrice(text);
  if (price === null) return null;
  const value = calculate(price.amount, price.currency?.code);
  if (value === undefined || !Number.isFinite(value)) return null;
  return formatPrice(value, price, currency);
}
