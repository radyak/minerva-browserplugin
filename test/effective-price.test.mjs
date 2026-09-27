import assert from "node:assert/strict";
import test from "node:test";

import { calculateEffectivePrice } from "../src/core/effective-price.js";
import { convertPrice } from "../src/core/price.js";
import { DEFAULT_SETTINGS } from "../src/core/settings.js";

const EUR_SETTINGS = { auctionPremium: 0, shipment: 0, currency: "EUR" };
// Into EUR; GBP deliberately has no rate.
const INTO_EUR = { EUR: 1, USD: 0.5 };

const calculate = (amount, currency, settings = {}) =>
  calculateEffectivePrice(amount, currency, { ...EUR_SETTINGS, ...settings }, INTO_EUR);

test("returns the amount unchanged without premium, shipment or conversion", () => {
  assert.equal(calculate(500, "EUR"), 500);
  assert.equal(calculateEffectivePrice(500, "EUR", DEFAULT_SETTINGS, { EUR: 1 }), 500);
});

test("converts with the rate of the input currency", () => {
  assert.equal(calculate(500, "USD"), 250);
});

test("adds the shipment", () => {
  assert.equal(calculate(500, "EUR", { shipment: 12.5 }), 512.5);
  const effective = (amount, currency) => calculate(amount, currency, { shipment: 12.5 });
  assert.equal(convertPrice("500 EUR", effective, "EUR"), "512.50 EUR");
});

test("adds the auction premium in percent", () => {
  assert.equal(calculate(500, "EUR", { auctionPremium: 20 }), 600);
  assert.equal(calculate(500, "EUR", { auctionPremium: 100 }), 1000);
});

test("adds the auction premium before the shipment", () => {
  assert.equal(calculate(500, "EUR", { auctionPremium: 20, shipment: 10 }), 610);
});

test("converts into the output currency first", () => {
  // 500 USD -> 250 EUR, +20% premium, +10 EUR shipment (entered in the output currency).
  assert.equal(calculate(500, "USD", { auctionPremium: 20, shipment: 10 }), 310);
});

test("is undefined without currency or rate", () => {
  assert.equal(calculate(500, undefined), undefined);
  assert.equal(calculate(500, "GBP"), undefined);
  assert.equal(calculateEffectivePrice(500, "EUR", EUR_SETTINGS, undefined), undefined);
});

test("is undefined for a rate that is not a finite number", () => {
  assert.equal(calculateEffectivePrice(500, "USD", EUR_SETTINGS, { USD: NaN }), undefined);
  assert.equal(calculateEffectivePrice(500, "USD", EUR_SETTINGS, { USD: Infinity }), undefined);
});
