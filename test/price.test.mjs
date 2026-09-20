import assert from "node:assert/strict";
import test from "node:test";

import { addMarkup, parsePrice } from "../src/core/price.js";

const plus20 = (text) => addMarkup(text, 0.2);

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
