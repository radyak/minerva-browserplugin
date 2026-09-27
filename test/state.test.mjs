import assert from "node:assert/strict";
import test from "node:test";

import { TabState } from "../src/core/state/TabState.js";

test("is inactive with nothing annotated by default", () => {
  assert.deepEqual(TabState.inactive().toJSON(), { active: false, annotated: 0, unparsable: 0 });
  assert.deepEqual(new TabState(), TabState.inactive());
});

test("compares by value", () => {
  const state = new TabState({ active: true, annotated: 3, unparsable: 1 });
  assert.equal(state.equals(new TabState({ active: true, annotated: 3, unparsable: 1 })), true);
  assert.equal(state.equals(new TabState({ active: true, annotated: 3, unparsable: 0 })), false);
  assert.equal(state.equals(new TabState({ active: false, annotated: 3, unparsable: 1 })), false);
  assert.equal(state.equals(null), false);
  assert.equal(state.equals(undefined), false);
});

test("survives a round trip through a message", () => {
  const state = new TabState({ active: true, annotated: 3, unparsable: 1 });
  const message = structuredClone({
    type: "state-changed",
    url: "https://x.test/",
    ...state.toJSON(),
  });
  assert.deepEqual(TabState.from(message), state);
});

test("reads anything missing or malformed as inactive / zero", () => {
  assert.deepEqual(TabState.from(undefined), TabState.inactive());
  assert.deepEqual(TabState.from(null), TabState.inactive());
  assert.deepEqual(
    TabState.from({ active: "yes", annotated: -1, unparsable: 1.5 }),
    TabState.inactive(),
  );
});
