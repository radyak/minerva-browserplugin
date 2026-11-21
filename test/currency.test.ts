import assert from "node:assert/strict";
import { test } from "vitest";

import { AuctionCurrency } from "../src/core/currency/AuctionCurrency.ts";
import { isCurrencyCode, isIsoCurrency } from "../src/core/currency/codes.ts";
import { CurrencyDetector } from "../src/core/currency/CurrencyDetector.ts";
import { UserCurrency } from "../src/core/currency/UserCurrency.ts";

test("tells an ISO code apart from a symbol", () => {
  assert.equal(isCurrencyCode("EUR"), true);
  assert.equal(isCurrencyCode("CHF"), true);
  assert.equal(isCurrencyCode("€"), false);
  assert.equal(isCurrencyCode("US$"), false);
  assert.equal(isCurrencyCode("SFr."), false);
  assert.equal(isCurrencyCode("eur"), false);
});

test("tells a currency code apart from anything else", () => {
  assert.equal(isIsoCurrency("INR"), true);
  assert.equal(isIsoCurrency("XYZ"), false);
  assert.equal(isIsoCurrency("eur"), false);
  assert.equal(isIsoCurrency(42), false);
});

test("takes any currency code as the user's currency, the default otherwise", () => {
  // Not an auction currency, but converting into it is fine.
  assert.equal(UserCurrency.orDefault("INR"), "INR");
  assert.equal(UserCurrency.orDefault("XYZ"), "EUR");
  assert.equal(UserCurrency.orDefault(undefined), UserCurrency.DEFAULT);
});

test("offers the auction currencies and the saved one without the API's list", () => {
  assert.deepEqual(
    UserCurrency.fallback("INR", "XYZ").map(({ code }) => code),
    [...AuctionCurrency.CODES, "INR"].sort(),
  );
  assert.equal(UserCurrency.fallback().find(({ code }) => code === "CHF")?.name, "Swiss Franc");
  const listed = [{ code: "EUR", name: "Euro" }];
  assert.deepEqual(UserCurrency.including(listed, "EUR"), listed);
  assert.deepEqual(UserCurrency.including(listed, "CHF"), [
    { code: "CHF", name: "Swiss Franc" },
    ...listed,
  ]);
});

test("looks a currency up by its code", () => {
  assert.equal(AuctionCurrency.of("GBP"), AuctionCurrency.GBP);
  assert.equal(AuctionCurrency.of("HKD"), null);
  assert.equal(AuctionCurrency.of(undefined), null);
  assert.deepEqual(AuctionCurrency.CODES, [
    ...["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "NZD", "JPY"],
    ...["DKK", "SEK", "NOK", "CZK", "PLN", "HUF"],
  ]);
  // Each one a real currency, each token for one currency only.
  assert.ok(AuctionCurrency.CODES.every((code) => isIsoCurrency(code)));
  const tokens = AuctionCurrency.ALL.flatMap((currency) => currency.tokens);
  assert.equal(new Set(tokens).size, tokens.length);
});

test("knows the decimal places of a currency", () => {
  assert.equal(AuctionCurrency.decimalsOf("EUR"), 2);
  assert.equal(new AuctionCurrency("XYZ", "X", ["XYZ"], 0).decimals, 0);
  // Not supported for detection: the standard ones.
  assert.equal(AuctionCurrency.decimalsOf("KRW"), 0);
  assert.equal(AuctionCurrency.decimalsOf("INR"), 2);
  // Nothing sensible to ask Intl about.
  assert.equal(AuctionCurrency.decimalsOf(undefined), 2);
  assert.equal(AuctionCurrency.decimalsOf("€"), 2);
});

test("writes the symbol for a symbol and the code for a code", () => {
  assert.equal(AuctionCurrency.EUR.notationFor("$"), "€");
  assert.equal(AuctionCurrency.EUR.notationFor("USD"), "EUR");
  // CHF has no symbol of its own.
  assert.equal(AuctionCurrency.CHF.notationFor("€"), "CHF");
});

test("detects every token of every supported currency", () => {
  const detector = new CurrencyDetector();
  for (const currency of AuctionCurrency.ALL) {
    for (const token of currency.tokens) {
      assert.equal(detector.find(`${token} 5`, "before")?.code, currency.code, token);
    }
  }
});

test("prefers the longer token at the same position", () => {
  const detector = new CurrencyDetector();
  assert.equal(detector.find("CA$ ", "before")?.code, "CAD");
  assert.equal(detector.find("AU$ ", "before")?.code, "AUD");
  assert.equal(detector.find("NZ$ ", "before")?.code, "NZD");
  assert.deepEqual(detector.find("US$ ", "before"), { code: "USD", token: "US$", index: 0 });
  assert.deepEqual(detector.find("SFr. ", "before"), { code: "CHF", token: "SFr.", index: 0 });
});

test("finds no token inside a word, but next to a number", () => {
  const forint = new AuctionCurrency("HUF", "Ft", ["HUF", "Ft"]);
  const koruna = new AuctionCurrency("CZK", "Kč", ["CZK", "Kč"]);
  const krona = new AuctionCurrency("SEK", "kr", ["SEK", "kr"]);
  const detector = new CurrencyDetector([
    forint,
    koruna,
    krona,
    AuctionCurrency.CHF,
    AuctionCurrency.EUR,
  ]);
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
  const yen = new AuctionCurrency("JPY", "¥", ["JPY", "¥"]);
  const detector = new CurrencyDetector([yen]);
  assert.equal(detector.find("¥500", "before")?.code, "JPY");
  assert.equal(detector.find("€500", "before"), null);
});
