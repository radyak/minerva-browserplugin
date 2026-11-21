import assert from "node:assert/strict";
import { test } from "vitest";

import { Currency } from "../src/core/currency/Currency.ts";
import { CurrencyDetector } from "../src/core/currency/CurrencyDetector.ts";

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

test("knows the decimal places of a currency", () => {
  assert.equal(Currency.decimalsOf("EUR"), 2);
  assert.equal(new Currency("XYZ", "X", ["XYZ"], 0).decimals, 0);
  // Not supported for detection: the standard ones.
  assert.equal(Currency.decimalsOf("KRW"), 0);
  assert.equal(Currency.decimalsOf("INR"), 2);
  // Nothing sensible to ask Intl about.
  assert.equal(Currency.decimalsOf(undefined), 2);
  assert.equal(Currency.decimalsOf("€"), 2);
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

test("finds no token inside a word, but next to a number", () => {
  const forint = new Currency("HUF", "Ft", ["HUF", "Ft"]);
  const koruna = new Currency("CZK", "Kč", ["CZK", "Kč"]);
  const krona = new Currency("SEK", "kr", ["SEK", "kr"]);
  const detector = new CurrencyDetector([forint, koruna, krona, Currency.CHF, Currency.EUR]);
  const code = (text: string, side: "before" | "after") => detector.find(text, side)?.code ?? null;
  // Letters next to a token that starts or ends with one: part of a word.
  assert.equal(code("Darabanth Kft. ", "before"), null);
  assert.equal(code(" kronor", "after"), null);
  assert.equal(code(" Kčs", "after"), null);
  assert.equal(code("ASFr. ", "before"), null);
  assert.equal(code(" EURO", "after"), null);
  // Digits, spaces and punctuation are fine.
  assert.equal(code("Ft", "after"), "HUF");
  assert.equal(code(" Kč", "after"), "CZK");
  assert.equal(code(" kr.", "after"), "SEK");
  assert.equal(code("(Fr. ", "before"), "CHF");
});

test("only knows the currencies it is given", () => {
  const yen = new Currency("JPY", "¥", ["JPY", "¥"]);
  const detector = new CurrencyDetector([yen]);
  assert.equal(detector.find("¥500", "before")?.code, "JPY");
  assert.equal(detector.find("€500", "before"), null);
});
