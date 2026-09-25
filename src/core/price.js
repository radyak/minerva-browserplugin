/**
 * Parsing, converting and re-formatting of prices found in page text.
 *
 * The goal is to give the result back in the same shape it came in: same
 * currency position, same decimal and grouping separators, same surrounding
 * text. With +20%: "500 EUR" -> "600 EUR", "USD 1.359" -> "USD 1.630,80".
 */

/** First number in the string, including grouping characters. */
const NUMBER_RE = /-?\d(?:[\d.,   ']*\d)?/;

/**
 * Work out which of "." and "," separates the decimals.
 * Returns null when the number carries no decimals at all.
 */
function detectDecimalSeparator(raw) {
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
function detectGroupSeparator(raw, decimalSeparator) {
  const used = new Set(raw.match(/[.,   ']/g) ?? []);
  if (decimalSeparator) used.delete(decimalSeparator);
  const [separator] = used;
  return separator ?? null;
}

/**
 * @typedef {object} ParsedPrice
 * @property {number} amount        numeric value
 * @property {number} decimals      decimals the input carried
 * @property {string} decimalSeparator separator to use when formatting
 * @property {string | null} groupSeparator separator to use, null = no grouping
 * @property {string} prefix        text before the number ("USD ", "Preis: €")
 * @property {string} suffix        text after the number (" EUR")
 * @property {string} raw           the trimmed input
 */

/**
 * Parse a price out of arbitrary text.
 * @param {string} text
 * @returns {ParsedPrice | null} null when no number could be found
 */
export function parsePrice(text) {
  if (typeof text !== "string") return null;
  const raw = text.replace(/\s+/g, " ").trim();
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

  return {
    amount,
    decimals,
    // Without decimals in the input, mirror the grouping style: "1.359" is
    // German-ish, so its decimals are written with a comma.
    decimalSeparator: decimalSeparator ?? (groupSeparator === "." ? "," : "."),
    groupSeparator,
    prefix: raw.slice(0, match.index),
    suffix: raw.slice(match.index + rawNumber.length),
    raw,
  };
}

/** Group the integer part in blocks of three. */
function group(integerPart, separator) {
  if (!separator) return integerPart;
  const sign = integerPart.startsWith("-") ? "-" : "";
  const digits = sign ? integerPart.slice(1) : integerPart;
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, separator);
}

/**
 * Render a value the way the parsed price was written.
 * @param {number} value
 * @param {ParsedPrice} price
 */
export function formatPrice(value, price) {
  const rounded = Math.round(value * 100) / 100;
  // Keep it integer only when the input was integer and nothing was lost.
  const decimals = price.decimals === 0 && Number.isInteger(rounded) ? 0 : 2;
  const [integerPart, decimalPart] = rounded.toFixed(decimals).split(".");

  const number = group(integerPart, price.groupSeparator);
  const formatted = decimalPart ? number + price.decimalSeparator + decimalPart : number;
  return price.prefix + formatted + price.suffix;
}

/**
 * Parse `text`, run its amount through `calculate` and render the result in the
 * same style.
 * @param {string} text
 * @param {(amount: number) => number} calculate
 * @returns {string | null} null when `text` holds no price
 */
export function convertPrice(text, calculate) {
  const price = parsePrice(text);
  if (price === null) return null;
  return formatPrice(calculate(price.amount), price);
}
