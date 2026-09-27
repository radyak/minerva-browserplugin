import assert from "node:assert/strict";
import test from "node:test";

import { Settings } from "../src/core/settings/Settings.js";

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
  assert.deepEqual(settings.toJSON(), { auctionPremium: 15.5, shipment: 7, currency: "CHF" });
  assert.deepEqual(Settings.from(structuredClone(settings.toJSON())), settings);
});

test("is immutable", () => {
  assert.throws(() => {
    /** @type {any} */ (Settings.DEFAULT).shipment = 5;
  }, TypeError);
});
