import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SETTINGS, readSettings, SETTINGS_STORAGE_KEYS } from "../src/core/settings.js";

/** A storage.local result holding `values`, keyed like the panel stores them. */
const stored = (values) =>
  Object.fromEntries(
    Object.entries(values).map(([name, value]) => [SETTINGS_STORAGE_KEYS[name], value]),
  );

test("falls back to the defaults without stored values", () => {
  assert.deepEqual(readSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings({}), DEFAULT_SETTINGS);
});

test("turns stored values into settings", () => {
  assert.deepEqual(readSettings(stored({ auctionPremium: "15.5", shipment: 7, currency: "CHF" })), {
    auctionPremium: 15.5,
    shipment: 7,
    currency: "CHF",
  });
});

test("accepts the bounds of the ranges", () => {
  assert.equal(readSettings(stored({ auctionPremium: 0 })).auctionPremium, 0);
  assert.equal(readSettings(stored({ auctionPremium: 100 })).auctionPremium, 100);
  assert.equal(readSettings(stored({ shipment: 0 })).shipment, 0);
  assert.equal(readSettings(stored({ shipment: 1e6 })).shipment, 1e6);
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
      readSettings(stored({ auctionPremium, shipment, currency })),
      DEFAULT_SETTINGS,
      `${auctionPremium} / ${shipment} / ${currency}`,
    );
  }
});

test("an unusable value does not affect the valid ones", () => {
  assert.deepEqual(readSettings(stored({ auctionPremium: 150, shipment: 10, currency: "CHF" })), {
    auctionPremium: 0,
    shipment: 10,
    currency: "CHF",
  });
});
