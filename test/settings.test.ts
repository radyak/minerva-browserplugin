import assert from "node:assert/strict";
import { test } from "vitest";

import { Settings } from "../src/core/settings/Settings.ts";

test("falls back to the defaults without stored values", () => {
  assert.deepEqual(Settings.from(undefined), Settings.DEFAULT);
  assert.deepEqual(Settings.from({}), Settings.DEFAULT);
});

test("turns stored data into settings", () => {
  assert.deepEqual(
    Settings.from({ auctionPremium: "15.5", shipment: 7, currency: "CHF" }),
    new Settings({
      auctionPremium: 15.5,
      shipment: 7,
      currency: "CHF",
    }),
  );
});

test("accepts the bounds of the ranges", () => {
  assert.equal(Settings.from({ auctionPremium: 0 }).auctionPremium, 0);
  assert.equal(Settings.from({ auctionPremium: 100 }).auctionPremium, 100);
  assert.equal(Settings.from({ shipment: 0 }).shipment, 0);
  assert.equal(Settings.from({ shipment: 1e6 }).shipment, 1e6);
});

test("falls back to the defaults for unusable values", () => {
  for (const [auctionPremium, shipment, currency] of [
    ["", "", ""],
    [null, null, null],
    ["abc", "-1", "eur"],
    ["101", "-0.01", "JPY"],
    [-1, Infinity, 42],
    [NaN, {}, [1, 2]],
  ]) {
    assert.deepEqual(
      Settings.from({ auctionPremium, shipment, currency }),
      Settings.DEFAULT,
      `${auctionPremium} / ${shipment} / ${currency}`,
    );
  }
});

test("an unusable value does not affect the valid ones", () => {
  assert.deepEqual(
    Settings.from({ auctionPremium: 150, shipment: 10, currency: "CHF" }),
    new Settings({
      auctionPremium: 0,
      shipment: 10,
      currency: "CHF",
    }),
  );
});

test("turns settings back into plain data", () => {
  const settings = new Settings({ auctionPremium: 15.5, shipment: 7, currency: "CHF" });
  assert.deepEqual(settings.toJSON(), {
    auctionPremium: 15.5,
    shipment: 7,
    lotsWon: 1,
    hammerVat: 0,
    importVat: 0,
    paymentCosts: 0,
    flatFees: 0,
    currency: "CHF",
  });
  assert.deepEqual(Settings.from(structuredClone(settings.toJSON())), settings);
});

test("reads data saved before lots won and hammer VAT existed with their defaults", () => {
  const settings = Settings.from({ auctionPremium: 20, shipment: 15, currency: "GBP" });
  assert.equal(settings.lotsWon, 1);
  assert.equal(settings.hammerVat, 0);
});

test("takes import VAT and payment costs up to 100 % and any flat fees from 0", () => {
  const base = { auctionPremium: 0, shipment: 0, currency: "EUR" };
  const costs = { importVat: 7, paymentCosts: 2.5, flatFees: 15 };
  assert.deepEqual(Settings.from({ ...base, ...costs }), new Settings({ ...base, ...costs }));
  const invalid = Settings.from({ ...base, importVat: 101, paymentCosts: "x", flatFees: -1 });
  assert.deepEqual([invalid.importVat, invalid.paymentCosts, invalid.flatFees], [0, 0, 0]);
  assert.equal(Settings.from({ ...base, flatFees: 1e6 }).flatFees, 1e6);
});

test("accepts whole numbers of lots from 1 and a hammer VAT up to 100 %", () => {
  assert.equal(Settings.from({ lotsWon: 3 }).lotsWon, 3);
  assert.equal(Settings.from({ lotsWon: "999" }).lotsWon, 999);
  for (const lotsWon of [0, 1.5, -2, 1000, "two", true]) {
    assert.equal(Settings.from({ lotsWon }).lotsWon, 1, `${lotsWon}`);
  }
  assert.equal(Settings.from({ hammerVat: 19 }).hammerVat, 19);
  assert.equal(Settings.from({ hammerVat: 100 }).hammerVat, 100);
  for (const hammerVat of [-1, 100.1, "", null]) {
    assert.equal(Settings.from({ hammerVat }).hammerVat, 0, `${hammerVat}`);
  }
});

test("is immutable", () => {
  assert.throws(() => {
    (Settings.DEFAULT as any).shipment = 5;
  }, TypeError);
});
