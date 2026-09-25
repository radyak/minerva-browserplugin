import assert from "node:assert/strict";
import test from "node:test";

import {
  exchangeRatesUrl,
  fetchExchangeRates,
  parseExchangeRates,
} from "../src/core/exchange-rates.js";

const fakeFetch = (body, status = 200) => async (url) => {
  fakeFetch.lastUrl = url;
  return { ok: status >= 200 && status < 300, status, json: async () => body };
};

test("asks for the other supported currencies only", () => {
  const url = new URL(exchangeRatesUrl("USD"));
  assert.equal(url.searchParams.get("base"), "USD");
  assert.equal(url.searchParams.get("symbols"), "EUR,GBP,CHF");
});

test("keeps the supported currencies of a valid response", () => {
  const json = {
    amount: 1,
    base: "EUR",
    date: "2026-09-25",
    rates: { CHF: 0.9445, GBP: 0.86045, USD: 1.1403, JPY: 170.1, EUR: 1 },
  };
  assert.deepEqual(parseExchangeRates(json, "EUR"), {
    base: "EUR",
    date: "2026-09-25",
    rates: { USD: 1.1403, GBP: 0.86045, CHF: 0.9445 },
  });
});

test("rejects a response for another base or without rates", () => {
  assert.throws(() => parseExchangeRates({ base: "USD", rates: {} }, "EUR"));
  assert.throws(() => parseExchangeRates({ base: "EUR" }, "EUR"));
  assert.throws(() => parseExchangeRates(null, "EUR"));
});

test("fetchExchangeRates requests and parses the rates", async () => {
  const body = { base: "GBP", date: "2026-09-25", rates: { EUR: 1.16, USD: 1.32, CHF: 1.09 } };
  const rates = await fetchExchangeRates("GBP", fakeFetch(body));
  assert.equal(new URL(fakeFetch.lastUrl).searchParams.get("base"), "GBP");
  assert.deepEqual(rates.rates, { EUR: 1.16, USD: 1.32, CHF: 1.09 });
});

test("fetchExchangeRates fails on an HTTP error", async () => {
  await assert.rejects(fetchExchangeRates("EUR", fakeFetch({}, 503)), /HTTP 503/);
});
