import assert from "node:assert/strict";
import { test } from "vitest";

import { effectivePrice, priceBreakdown } from "../src/core/pricing/PriceCalculator.ts";
import { convertPrice } from "../src/core/price.ts";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.ts";
import { BuyerCosts } from "../src/core/settings/BuyerCosts.ts";
import { Settings } from "../src/core/settings/Settings.ts";

const EUR_SETTINGS = new Settings({ auctionPremium: 0, shipment: 0, currency: "EUR" });
// Into EUR; GBP deliberately has no rate.
const INTO_EUR = new ExchangeRates("EUR", "", { USD: 2 });

const calculate = (amount, currency, settings = {}) =>
  effectivePrice(amount, currency, new Settings({ ...EUR_SETTINGS, ...settings }), INTO_EUR);

test("returns the amount unchanged without premium, shipment or conversion", () => {
  assert.equal(calculate(500, "EUR"), 500);
  assert.equal(effectivePrice(500, "EUR", Settings.DEFAULT, ExchangeRates.empty("EUR")), 500);
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

test("converts the shipment along with the price", () => {
  // 500 USD +20% premium, +10 USD shipment (entered in the auction's currency) -> 610 USD.
  assert.equal(calculate(500, "USD", { auctionPremium: 20, shipment: 10 }), 305);
  const effective = (amount, currency) => calculate(amount, currency, { shipment: 100 });
  assert.equal(convertPrice("$49.90", effective, "EUR"), "€74.95");
});

test("is undefined without currency or rate", () => {
  assert.equal(calculate(500, undefined), undefined);
  assert.equal(calculate(500, "GBP"), undefined);
  assert.equal(effectivePrice(500, "EUR", EUR_SETTINGS, undefined), undefined);
});

test("is undefined for a rate that is not a finite number", () => {
  for (const rate of [NaN, Infinity, 0]) {
    const rates = new ExchangeRates("EUR", "", { USD: rate });
    assert.equal(effectivePrice(500, "USD", EUR_SETTINGS, rates), undefined, `${rate}`);
  }
});

const BUYER = new BuyerCosts({ enabled: true, importVat: 7, paymentCosts: 3, flatFees: 20 });

test("splits the shipment over the lots expected to win", () => {
  assert.equal(calculate(500, "EUR", { shipment: 30, lotsWon: 3 }), 510);
});

test("adds the hammer VAT on the hammer price only, the premium carrying its own", () => {
  // 1000 + 23.8 % effective premium + 19 % VAT on the hammer price.
  assert.equal(calculate(1000, "EUR", { auctionPremium: 23.8, hammerVat: 19 }), 1428);
});

test("adds payment costs and import VAT on the converted lot, flat fees per lot", () => {
  const price = (buyer, lotsWon = 1) =>
    effectivePrice(
      500,
      "USD",
      new Settings({ ...EUR_SETTINGS, shipment: 100, lotsWon }),
      INTO_EUR,
      buyer,
    );
  // 500 USD + 100 USD shipment = 600 USD = 300 EUR, + 3 % + 7 % = 330, + 20 fees = 350.
  assert.equal(price(BUYER), 350);
  // Two lots: (500 + 50) / 2 = 275 EUR, + 10 % = 302.50, + 10 fees.
  assert.equal(price(BUYER, 2), 312.5);
  assert.equal(price(BuyerCosts.from({ ...BUYER.toJSON(), enabled: false })), 300);
  assert.equal(price(undefined), 300);
});

test("breaks the price down part by part", () => {
  const settings = new Settings({
    auctionPremium: 20,
    shipment: 30,
    lotsWon: 3,
    hammerVat: 10,
    currency: "EUR",
  });
  assert.deepEqual(priceBreakdown(1000, "USD", settings, INTO_EUR, BUYER), {
    auction: {
      currency: "USD",
      hammer: 1000,
      premium: 200,
      hammerVat: 100,
      shipment: 10,
      lot: 1310,
    },
    buyer: {
      currency: "EUR",
      lot: 655,
      payment: 19.65,
      importVat: 45.85,
      flatFees: 20 / 3,
      total: 655 + 19.65 + 45.85 + 20 / 3,
    },
  });
  assert.equal(priceBreakdown(1000, "GBP", settings, INTO_EUR, BUYER), undefined);
});
