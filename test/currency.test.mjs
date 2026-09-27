import assert from "node:assert/strict";
import test from "node:test";

import { Currency } from "../src/core/currency/Currency.js";
import { CurrencyDetector } from "../src/core/currency/CurrencyDetector.js";

test("tells an ISO code apart from a symbol", () => {
  assert.equal(Currency.isCode("EUR"), true);
  assert.equal(Currency.isCode("CHF"), true);
  assert.equal(Currency.isCode("€"), false);
  assert.equal(Currency.isCode("US$"), false);
  assert.equal(Currency.isCode("SFr."), false);
  assert.equal(Currency.isCode("eur"), false);
});

test("looks a currency up by its code", () => {
  assert.equal(Currency.of("GBP"), Currency.GBP);
  assert.equal(Currency.of("JPY"), null);
  assert.equal(Currency.of(undefined), null);
  assert.deepEqual(Currency.CODES, ["EUR", "USD", "GBP", "CHF"]);
});

test("writes the symbol for a symbol and the code for a code", () => {
  assert.equal(Currency.EUR.notationFor("$"), "€");
  assert.equal(Currency.EUR.notationFor("USD"), "EUR");
  // CHF has no symbol of its own.
  assert.equal(Currency.CHF.notationFor("€"), "CHF");
});

test("detects every token of every supported currency", () => {
  const detector = new CurrencyDetector();
  for (const currency of Currency.ALL) {
    for (const token of currency.tokens) {
      assert.equal(detector.find(`${token} 5`, "before")?.code, currency.code, token);
    }
  }
});

test("prefers the longer token at the same position", () => {
  const detector = new CurrencyDetector();
  assert.deepEqual(detector.find("US$ ", "before"), { code: "USD", token: "US$", index: 0 });
  assert.deepEqual(detector.find("SFr. ", "before"), { code: "CHF", token: "SFr.", index: 0 });
});

test("only knows the currencies it is given", () => {
  const yen = new Currency("JPY", "¥", ["JPY", "¥"]);
  const detector = new CurrencyDetector([yen]);
  assert.equal(detector.find("¥500", "before")?.code, "JPY");
  assert.equal(detector.find("€500", "before"), null);
});
