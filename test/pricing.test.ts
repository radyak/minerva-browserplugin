import assert from "node:assert/strict";
import { test } from "vitest";

import { explainPrice } from "../src/core/pricing/explainPrice.ts";
import { effectivePrice, priceBreakdown } from "../src/core/pricing/PriceCalculator.ts";
import { convertPrice } from "../src/core/price.ts";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.ts";
import { Settings } from "../src/core/settings/Settings.ts";
import { defineSite } from "../src/core/sites/sites.ts";

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

const COSTS = { importVat: 7, paymentCosts: 3, flatFees: 20 };

test("splits the shipment over the lots expected to win", () => {
  assert.equal(calculate(500, "EUR", { shipment: 30, lotsWon: 3 }), 510);
});

test("adds the hammer VAT on the hammer price only, the premium carrying its own", () => {
  // 1000 + 23.8 % effective premium + 19 % VAT on the hammer price.
  assert.equal(calculate(1000, "EUR", { auctionPremium: 23.8, hammerVat: 19 }), 1428);
});

test("adds payment costs and import VAT on the converted lot, flat fees per lot", () => {
  const price = (costs: object, lotsWon = 1) =>
    effectivePrice(
      500,
      "USD",
      new Settings({ ...EUR_SETTINGS, shipment: 100, lotsWon, ...costs }),
      INTO_EUR,
    );
  // 500 USD + 100 USD shipment = 600 USD = 300 EUR, + 3 % + 7 % = 330, + 20 fees = 350.
  assert.equal(price(COSTS), 350);
  // Two lots: (500 + 50) / 2 = 275 EUR, + 10 % = 302.50, + 10 fees.
  assert.equal(price(COSTS, 2), 312.5);
  assert.equal(price({}), 300);
});

test("breaks the price down part by part", () => {
  const settings = new Settings({
    auctionPremium: 20,
    shipment: 30,
    lotsWon: 3,
    hammerVat: 10,
    ...COSTS,
    currency: "EUR",
  });
  assert.deepEqual(priceBreakdown(1000, "USD", settings, INTO_EUR), {
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
  assert.equal(priceBreakdown(1000, "GBP", settings, INTO_EUR), undefined);
});

const SITE = defineSite({ origin: "https://shop.test", paths: ["/*"], priceSelectors: [".p"] });
const explain = (text: string, settings: Settings, site = SITE) =>
  explainPrice(text, site, settings, INTO_EUR);

test("explains a price part by part, written like the page writes it", () => {
  const settings = new Settings({
    auctionPremium: 20,
    shipment: 30,
    lotsWon: 3,
    hammerVat: 10,
    ...COSTS,
    currency: "EUR",
  });
  // The text around the price is left out, the notation (separators, currency position) kept.
  assert.deepEqual(explain("Current bid: USD 1.000,00", settings), {
    rows: [
      { label: "Hammer price", amount: "USD 1.000,00" },
      { label: "+ Premium 20 %", amount: "USD 200,00" },
      { label: "+ VAT 10 % on the hammer price", amount: "USD 100,00" },
      { label: "+ Shipment 30 ÷ 3 lots", amount: "USD 10,00" },
      { label: "= Invoice share", amount: "USD 1.310,00", total: true },
      { label: "= In EUR (1 USD = 0,5 EUR)", amount: "EUR 655,00" },
      { label: "+ Payment costs 3 %", amount: "EUR 19,65" },
      { label: "+ Import VAT 7 %", amount: "EUR 45,85" },
      { label: "+ Flat fees 20 ÷ 3 lots", amount: "EUR 6,67" },
      { label: "= Effective price", amount: "EUR 727,17", total: true },
    ],
  });
});

test("leaves out parts that are 0 and the conversion when there is none", () => {
  assert.deepEqual(explain("500 EUR", EUR_SETTINGS), {
    rows: [
      { label: "Hammer price", amount: "500 EUR" },
      { label: "= Effective price", amount: "500 EUR", total: true },
    ],
  });
});

test("says why a price cannot be explained", () => {
  assert.deepEqual(explain("sold", EUR_SETTINGS), { message: "No price could be read here." });
  assert.deepEqual(explain("500", EUR_SETTINGS), {
    message: "The currency of this price is not known.",
  });
  assert.deepEqual(explain("500 GBP", EUR_SETTINGS), {
    message: "No exchange rate from GBP into EUR.",
  });
});

test("only shows the result of a site's own calculator, whose parts are unknown", () => {
  const site = defineSite({ ...SITE, calculator: (amount) => amount * 3 });
  assert.deepEqual(explain("100 EUR", EUR_SETTINGS, site), {
    rows: [
      { label: "Hammer price", amount: "100 EUR" },
      { label: "= Effective price", amount: "300 EUR", total: true },
    ],
  });
});
