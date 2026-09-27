import assert from "node:assert/strict";
import test from "node:test";

import {
  conversionRates,
  exchangeRatesUrl,
  fetchExchangeRates,
  parseExchangeRates,
} from "../src/core/exchange-rates.js";

/** URL of the last request made through fakeFetch. */
let lastUrl;

/**
 * Stand-in for `fetch` that answers every request with `body`.
 * @returns {typeof fetch}
 */
const fakeFetch = (body, status = 200) =>
  /** @type {any} */ (
    async (url) => {
      lastUrl = url;
      return { ok: status >= 200 && status < 300, status, json: async () => body };
    }
  );

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
  assert.equal(new URL(lastUrl).searchParams.get("base"), "GBP");
  assert.deepEqual(rates.rates, { EUR: 1.16, USD: 1.32, CHF: 1.09 });
});

test("fetchExchangeRates fails on an HTTP error", async () => {
  await assert.rejects(fetchExchangeRates("EUR", fakeFetch({}, 503)), /HTTP 503/);
});

test("conversionRates inverts the rates published for the output currency", () => {
  const rates = conversionRates({ base: "EUR", date: "", rates: { USD: 1.25, GBP: 0.8 } }, "EUR");
  assert.deepEqual(rates, { EUR: 1, USD: 0.8, GBP: 1.25 });
});

test("conversionRates only knows the output currency without matching rates", () => {
  const usd = { base: "USD", date: "", rates: { EUR: 0.9 } };
  assert.deepEqual(conversionRates(usd, "EUR"), { EUR: 1 });
  assert.deepEqual(conversionRates(undefined, "CHF"), { CHF: 1 });
  assert.deepEqual(conversionRates({ base: "EUR", rates: { USD: 0, GBP: "x" } }, "EUR"), {
    EUR: 1,
  });
});
