import assert from "node:assert/strict";
import { test } from "vitest";

import { BuyerCosts } from "../src/core/settings/BuyerCosts.ts";

const COSTS = new BuyerCosts({ enabled: true, importVat: 7, paymentCosts: 2.5, flatFees: 15 });

test("falls back to switched off, without costs, when nothing is stored", () => {
  assert.deepEqual(BuyerCosts.from(undefined), BuyerCosts.DEFAULT);
  assert.deepEqual(BuyerCosts.from({}), BuyerCosts.DEFAULT);
  assert.equal(BuyerCosts.DEFAULT.enabled, false);
});

test("turns stored data into buyer costs and back", () => {
  assert.deepEqual(BuyerCosts.from(structuredClone(COSTS.toJSON())), COSTS);
  assert.deepEqual(COSTS.toJSON(), {
    enabled: true,
    importVat: 7,
    paymentCosts: 2.5,
    flatFees: 15,
  });
});

test("only an explicit true switches them on", () => {
  for (const enabled of ["true", 1, null, undefined]) {
    assert.equal(BuyerCosts.from({ ...COSTS.toJSON(), enabled }).enabled, false, `${enabled}`);
  }
});

test("falls back for each unusable value on its own", () => {
  assert.deepEqual(
    BuyerCosts.from({ enabled: true, importVat: 101, paymentCosts: "x", flatFees: 15 }),
    new BuyerCosts({ enabled: true, importVat: 0, paymentCosts: 0, flatFees: 15 }),
  );
  assert.equal(BuyerCosts.from({ flatFees: -1 }).flatFees, 0);
  assert.equal(BuyerCosts.from({ flatFees: 1e6 }).flatFees, 1e6);
});

test("applies its costs only while switched on, keeping them while off", () => {
  assert.deepEqual(COSTS.applied, COSTS);
  const off = BuyerCosts.from({ ...COSTS.toJSON(), enabled: false });
  assert.equal(off.importVat, 7);
  assert.deepEqual(off.applied, { importVat: 0, paymentCosts: 0, flatFees: 0 });
});

test("is immutable", () => {
  assert.throws(() => {
    (BuyerCosts.DEFAULT as any).flatFees = 5;
  }, TypeError);
});
