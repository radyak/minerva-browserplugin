import assert from "node:assert/strict";
import { test } from "vitest";

import { convertPrice, parsePrice } from "../src/core/price.ts";

// The formatting cases are independent of the actual calculation.
const plus20 = (text) => convertPrice(text, (amount) => amount * 1.2);

test("parses the plain cases from the ticket", () => {
  assert.equal(parsePrice("500 EUR").amount, 500);
  assert.equal(parsePrice("USD 1.359").amount, 1359);
});

test("adds 20% and keeps the original notation", () => {
  assert.equal(plus20("500 EUR"), "600 EUR");
  assert.equal(plus20("USD 1.359"), "USD 1.630,80");
  assert.equal(plus20("€49.99"), "€59.99");
  assert.equal(plus20("1.234,56 EUR"), "1.481,47 EUR");
  assert.equal(plus20("1,234.56 USD"), "1,481.47 USD");
  assert.equal(plus20("CHF 1'200"), "CHF 1'440");
  assert.equal(plus20("12 500 EUR"), "15 000 EUR");
});

test("keeps surrounding text and whitespace shape", () => {
  assert.equal(plus20("  Preis: 500 EUR  "), "Preis: 600 EUR");
  assert.equal(plus20("500EUR"), "600EUR");
});

test("distinguishes decimal separator from grouping", () => {
  // Three digits after a single separator means grouping…
  assert.equal(parsePrice("1.359").amount, 1359);
  assert.equal(parsePrice("1,359").amount, 1359);
  // …anything else is a decimal separator.
  assert.equal(parsePrice("1.35").amount, 1.35);
  assert.equal(parsePrice("1,3599").amount, 1.3599);
  // Repeated separators are always grouping.
  assert.equal(parsePrice("1.234.567").amount, 1234567);
});

test("ignores bracketed asides", () => {
  // biddr: price realized followed by the bid count.
  assert.equal(parsePrice("1'200 EUR (20)").amount, 1200);
  assert.equal(plus20("1'200 EUR (20)"), "1'440 EUR");
  assert.equal(plus20("340 EUR\n   (14)"), "408 EUR");
  // Before the number, in the middle, nested, other bracket kinds.
  assert.equal(plus20("(3 bids) 500 EUR"), "600 EUR");
  assert.equal(plus20("Preis (netto): 500 EUR"), "Preis: 600 EUR");
  assert.equal(plus20("500 EUR (approx. (ca.) 580 USD)"), "600 EUR");
  assert.equal(plus20("500 EUR [12] {x}"), "600 EUR");
  // A price that is nothing but an aside is still a price.
  assert.equal(plus20("(500 EUR)"), "(600 EUR)");
});

test("handles negative amounts", () => {
  assert.equal(plus20("-500 EUR"), "-600 EUR");
});

test("returns null when there is no price", () => {
  assert.equal(parsePrice("sold out"), null);
  assert.equal(parsePrice(""), null);
  assert.equal(parsePrice(undefined), null);
  assert.equal(plus20("sold out"), null);
});

test("rounds to two decimals", () => {
  assert.equal(plus20("0,01 EUR"), "0,01 EUR"); // 0.012 -> 0.01
  assert.equal(plus20("10,55 EUR"), "12,66 EUR");
});

test("rounds to the decimal places of the result's currency", () => {
  const times = (factor) => (amount) => amount * factor;
  // Without decimals of their own: no decimals, even from an input with some.
  assert.equal(convertPrice("€49.99", times(160.123), "JPY"), "¥8005");
  assert.equal(convertPrice("EUR 500", times(373.55), "HUF"), "HUF 186775");
  assert.equal(convertPrice("1.234,56 EUR", times(160.123), "ISK"), "197.681 ISK");
  // Two decimals otherwise, also for currencies Intl does not know.
  assert.equal(convertPrice("500 EUR", times(1.0001), "XYZ"), "500.05 XYZ");
});

test("returns null when the calculation has no result", () => {
  assert.equal(
    convertPrice("500 GBP", () => undefined, "EUR"),
    null,
  );
});

test("detects the currency next to the number", () => {
  const code = (text) => parsePrice(text).currency?.code ?? null;
  assert.equal(code("500 EUR"), "EUR");
  assert.equal(code("€49.99"), "EUR");
  assert.equal(code("USD 1.359"), "USD");
  assert.equal(code("US$ 20"), "USD");
  assert.equal(code("$20"), "USD");
  assert.equal(code("£1,200"), "GBP");
  assert.equal(code("CHF 1'200"), "CHF");
  assert.equal(code("SFr. 50"), "CHF");
  assert.equal(code("500EUR"), "EUR");
  // The one closest to the number wins, the prefix before the suffix.
  assert.equal(code("GBP 500 (approx. 580 EUR)"), "GBP");
  assert.equal(code("Preis: 500 EUR"), "EUR");
  // Nothing (supported) there.
  assert.equal(code("500"), null);
  assert.equal(code("₹500"), null);
  assert.equal(code("500 kr"), null); // DKK, SEK or NOK?
  assert.equal(code("500 EURO"), null);
  assert.equal(code("Gebühr. 500"), null); // no "Fr." in it, nor "hr."
});

test("detects the currencies beyond the big four", () => {
  const code = (text) => parsePrice(text).currency?.code ?? null;
  assert.equal(code("C$ 1,250"), "CAD");
  assert.equal(code("CA$1,250"), "CAD");
  assert.equal(code("A$ 400"), "AUD");
  assert.equal(code("AU$400"), "AUD");
  assert.equal(code("NZ$ 75"), "NZD");
  assert.equal(code("¥120,000"), "JPY");
  assert.equal(code("￥120,000"), "JPY");
  assert.equal(code("DKK 2.500"), "DKK");
  assert.equal(code("1 500 SEK"), "SEK");
  assert.equal(code("NOK 900"), "NOK");
  assert.equal(code("12 500 Kč"), "CZK");
  assert.equal(code("1 234,50 zł"), "PLN");
  assert.equal(code("45 000 Ft"), "HUF");
  // A bare "$" is still the US dollar.
  assert.equal(code("$ 20"), "USD");
  assert.equal(code("US$ 20"), "USD");
});

test("writes the new currencies in the input's notation", () => {
  const half = (amount) => amount / 2;
  assert.equal(convertPrice("C$100", half, "EUR"), "€50");
  assert.equal(convertPrice("€100", half, "AUD"), "A$50");
  assert.equal(convertPrice("12 500 Kč", half, "PLN"), "6 250 zł");
  assert.equal(convertPrice("45 000 Ft", half, "EUR"), "22 500 €");
  assert.equal(convertPrice("1 234,50 zł", half, "HUF"), "617 Ft");
  assert.equal(convertPrice("¥120,000", half, "SEK"), "SEK 60,000");
  assert.equal(convertPrice("€20", half, "DKK"), "DKK 10");
});

test("writes the result in the output currency, keeping the notation", () => {
  const half = (amount) => amount / 2;
  assert.equal(convertPrice("500 USD", half, "EUR"), "250 EUR");
  assert.equal(convertPrice("USD 1.359", half, "EUR"), "EUR 679,50");
  assert.equal(convertPrice("$20", half, "EUR"), "€10");
  assert.equal(convertPrice("$20", half, "CHF"), "CHF 10");
  assert.equal(convertPrice("20$", half, "CHF"), "10 CHF");
  assert.equal(convertPrice("Preis: 500 USD inkl.", half, "GBP"), "Preis: 250 GBP inkl.");
  // Same currency or none requested: the text stays as it was.
  assert.equal(convertPrice("€20", half, "EUR"), "€10");
  assert.equal(convertPrice("€20", half), "€10");
});
