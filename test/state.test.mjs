import assert from "node:assert/strict";
import test from "node:test";

import { defineSite } from "../src/core/sites/sites.ts";
import { TabState } from "../src/core/state/TabState.ts";

test("is inactive with nothing annotated by default", () => {
  assert.deepEqual(TabState.inactive(), {
    active: false,
    annotated: 0,
    unparsable: 0,
    currencies: [],
    site: null,
    house: null,
    auction: null,
  });
  assert.deepEqual(TabState.of(), TabState.inactive());
});

test("keeps the currencies sorted and without duplicates", () => {
  assert.deepEqual(TabState.of({ currencies: ["USD", "EUR", "USD"] }).currencies, ["EUR", "USD"]);
});

test("compares by value", () => {
  const state = TabState.of({ active: true, annotated: 3, unparsable: 1 });
  const equals = (a, b) => TabState.equals(a, b);
  assert.equal(equals(state, TabState.of({ active: true, annotated: 3, unparsable: 1 })), true);
  assert.equal(equals(state, TabState.of({ active: true, annotated: 3, unparsable: 0 })), false);
  assert.equal(equals(state, TabState.of({ active: false, annotated: 3, unparsable: 1 })), false);
  assert.equal(
    equals(
      TabState.of({ currencies: ["USD", "EUR", "USD"] }),
      TabState.of({ currencies: ["EUR", "USD"] }),
    ),
    true,
  );
  assert.equal(
    equals(TabState.of({ currencies: ["USD"] }), TabState.of({ currencies: ["EUR"] })),
    false,
  );
  assert.equal(
    equals(TabState.of({ site: "https://a.test" }), TabState.of({ site: "https://b.test" })),
    false,
  );
  assert.equal(
    equals(
      TabState.of({ house: "leu", auction: "7" }),
      TabState.of({ house: "leu", auction: "8" }),
    ),
    false,
  );
  assert.equal(equals(state, null), false);
  assert.equal(equals(state, undefined), false);
});

test("survives a round trip through a message", () => {
  const state = TabState.of({
    active: true,
    annotated: 3,
    unparsable: 1,
    currencies: ["USD"],
    site: "https://x.test",
    house: "leu",
    auction: "7",
  });
  const message = structuredClone({ type: "state-changed", url: "https://x.test/", ...state });
  assert.deepEqual(TabState.from(message), state);
});

test("reads anything missing or malformed as inactive / zero", () => {
  assert.deepEqual(TabState.from(undefined), TabState.inactive());
  assert.deepEqual(TabState.from(null), TabState.inactive());
  assert.deepEqual(
    TabState.from({
      active: "yes",
      annotated: -1,
      unparsable: 1.5,
      currencies: "USD",
      site: 1,
      house: "",
      auction: 7,
    }),
    TabState.inactive(),
  );
});

test("judges a tab without content script by its URL", () => {
  const sites = [
    defineSite({
      origin: "https://shop.test",
      paths: ["/lot/*"],
      priceSelectors: [".price"],
      ids: { house: { query: "h" }, auction: { path: "/lot/:id" } },
    }),
  ];
  assert.deepEqual(
    TabState.forUrl(sites, "https://shop.test/lot/1?h=leu"),
    TabState.of({ active: true, site: "https://shop.test", house: "leu", auction: "1" }),
  );
  assert.deepEqual(TabState.forUrl(sites, "https://other.test/"), TabState.inactive());
  assert.deepEqual(TabState.forUrl(sites, undefined), TabState.inactive());
});

test("is on an auction while active with a house or auction ID", () => {
  const onAuction = (values) => TabState.onAuction(TabState.of(values));
  assert.equal(onAuction({ active: true, house: "leu" }), true);
  assert.equal(onAuction({ active: true, auction: "7" }), true);
  assert.equal(onAuction({ active: true, site: "https://a.test" }), false);
  assert.equal(onAuction({ house: "leu", auction: "7" }), false);
});
