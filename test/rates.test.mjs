import assert from "node:assert/strict";
import test from "node:test";

import { ExchangeRates } from "../src/core/rates/ExchangeRates.js";
import { RatesClient } from "../src/core/rates/RatesClient.js";

/** URL of the last request made through fakeFetch. */
let lastUrl;

/** Stand-in for `fetch` that answers every request with `body`. */
const fakeFetch =
  (body, status = 200) =>
  async (url) => {
    lastUrl = url;
    return /** @type {any} */ ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  };

const CODES = ["EUR", "USD", "GBP", "CHF"];

test("asks for the other supported currencies only", () => {
  const url = new URL(new RatesClient().urlFor("USD"));
  assert.equal(url.searchParams.get("base"), "USD");
  assert.equal(url.searchParams.get("symbols"), "EUR,GBP,CHF");
});

test("keeps the requested currencies of a valid response", () => {
  const json = {
    amount: 1,
    base: "EUR",
    date: "2026-09-25",
    rates: { CHF: 0.9445, GBP: 0.86045, USD: 1.1403, JPY: 170.1, EUR: 1 },
  };
  assert.deepEqual(ExchangeRates.fromJSON(json, "EUR", CODES).toJSON(), {
    base: "EUR",
    date: "2026-09-25",
    rates: { USD: 1.1403, GBP: 0.86045, CHF: 0.9445 },
  });
});

test("rejects a response for another base or without rates", () => {
  assert.throws(() => ExchangeRates.fromJSON({ base: "USD", rates: {} }, "EUR", CODES));
  assert.throws(() => ExchangeRates.fromJSON({ base: "EUR" }, "EUR", CODES));
  assert.throws(() => ExchangeRates.fromJSON(null, "EUR", CODES));
});

test("RatesClient requests and parses the rates", async () => {
  const body = { base: "GBP", date: "2026-09-25", rates: { EUR: 1.16, USD: 1.32, CHF: 1.09 } };
  const rates = await new RatesClient(fakeFetch(body)).fetch("GBP");
  assert.equal(new URL(lastUrl).searchParams.get("base"), "GBP");
  assert.deepEqual(rates.rates, { EUR: 1.16, USD: 1.32, CHF: 1.09 });
});

test("RatesClient fails on an HTTP error", async () => {
  await assert.rejects(new RatesClient(fakeFetch({}, 503)).fetch("EUR"), /HTTP 503/);
});

test("converts into the base with the inverted rate", () => {
  const rates = new ExchangeRates("EUR", "", { USD: 1.25, GBP: 0.8 });
  assert.equal(rates.factorFrom("EUR"), 1);
  assert.equal(rates.factorFrom("USD"), 0.8);
  assert.equal(rates.factorFrom("GBP"), 1.25);
  assert.equal(rates.convert(100, "USD"), 80);
  assert.equal(rates.convert(100, "EUR"), 100);
});

test("cannot convert currencies without a rate", () => {
  const rates = new ExchangeRates("EUR", "", { USD: 1.25 });
  assert.equal(rates.factorFrom("CHF"), undefined);
  assert.equal(rates.factorFrom(undefined), undefined);
  assert.equal(rates.convert(100, "CHF"), undefined);
});

test("drops rates that are not positive finite numbers", () => {
  const rates = new ExchangeRates("EUR", "", {
    USD: 0,
    GBP: "x",
    CHF: NaN,
    JPY: Infinity,
    SEK: -1,
    EUR: 2,
  });
  assert.deepEqual(rates.rates, {});
});

test("reads stored rates only when they were saved for the base", () => {
  const saved = new ExchangeRates("EUR", "2026-09-25", { USD: 1.25 }).toJSON();
  assert.deepEqual(ExchangeRates.fromStorage(saved, "EUR").toJSON(), saved);
  assert.deepEqual(ExchangeRates.fromStorage(saved, "USD"), ExchangeRates.empty("USD"));
  assert.deepEqual(ExchangeRates.fromStorage(undefined, "CHF"), ExchangeRates.empty("CHF"));
  assert.deepEqual(ExchangeRates.fromStorage({ base: "EUR" }, "EUR"), ExchangeRates.empty("EUR"));
});

test("empty rates only convert the base itself", () => {
  const rates = ExchangeRates.empty("CHF");
  assert.equal(rates.convert(10, "CHF"), 10);
  assert.equal(rates.convert(10, "EUR"), undefined);
});
