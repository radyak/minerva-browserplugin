import assert from "node:assert/strict";
import test from "node:test";

import { calculateEffectivePrice } from "../src/core/effective-price.js";
import { convertPrice, parsePrice } from "../src/core/price.js";
import { DEFAULT_SETTINGS, readSettings, SETTINGS_STORAGE_KEYS } from "../src/core/settings.js";

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

const EUR_SETTINGS = { auctionPremium: 0, shipment: 0, currency: "EUR" };
const INTO_EUR = { EUR: 1, USD: 0.5 };

test("the effective price adds the shipment", () => {
  const settings = { ...EUR_SETTINGS, shipment: 12.5 };
  const effective = (amount, currency) => calculateEffectivePrice(amount, currency, settings, INTO_EUR);
  assert.equal(calculateEffectivePrice(500, "EUR", settings, INTO_EUR), 512.5);
  assert.equal(convertPrice("500 EUR", effective, "EUR"), "512.50 EUR");
  assert.equal(calculateEffectivePrice(500, "EUR", DEFAULT_SETTINGS, { EUR: 1 }), 500);
});

test("the effective price adds the auction premium before the shipment", () => {
  const settings = { ...EUR_SETTINGS, auctionPremium: 20 };
  assert.equal(calculateEffectivePrice(500, "EUR", settings, INTO_EUR), 600);
  assert.equal(calculateEffectivePrice(500, "EUR", { ...settings, shipment: 10 }, INTO_EUR), 610);
});

test("the effective price converts into the output currency first", () => {
  const settings = { auctionPremium: 20, shipment: 10, currency: "EUR" };
  // 500 USD -> 250 EUR, +20% premium, +10 EUR shipment.
  assert.equal(calculateEffectivePrice(500, "USD", settings, INTO_EUR), 310);
});

test("the effective price is undefined without currency or rate", () => {
  assert.equal(calculateEffectivePrice(500, undefined, EUR_SETTINGS, INTO_EUR), undefined);
  assert.equal(calculateEffectivePrice(500, "GBP", EUR_SETTINGS, INTO_EUR), undefined);
  assert.equal(calculateEffectivePrice(500, "EUR", EUR_SETTINGS, undefined), undefined);
  assert.equal(convertPrice("500 GBP", () => undefined, "EUR"), null);
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
  assert.equal(code("¥500"), null);
  assert.equal(code("500 EURO"), null);
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

test("readSettings turns stored values into settings", () => {
  const { auctionPremium, shipment, currency } = SETTINGS_STORAGE_KEYS;
  assert.deepEqual(readSettings({ [auctionPremium]: "15.5", [shipment]: 7, [currency]: "CHF" }), {
    auctionPremium: 15.5,
    shipment: 7,
    currency: "CHF",
  });
  assert.deepEqual(readSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings({}), DEFAULT_SETTINGS);
});

test("readSettings falls back to the defaults for unusable values", () => {
  const { auctionPremium, shipment, currency } = SETTINGS_STORAGE_KEYS;
  for (const [premium, ship, code] of [
    ["", "", ""],
    [null, null, null],
    ["abc", "-1", "eur"],
    ["101", "-0.01", "JPY"],
  ]) {
    assert.deepEqual(
      readSettings({ [auctionPremium]: premium, [shipment]: ship, [currency]: code }),
      DEFAULT_SETTINGS,
      `${premium} / ${ship}`,
    );
  }
});
