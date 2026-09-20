import assert from "node:assert/strict";
import test from "node:test";

import { urlMatches } from "../src/core/url-matcher.js";

test("matches a plain prefix glob", () => {
  assert.equal(urlMatches("https://example.com/app/dashboard", "https://example.com/app/dashboard*"), true);
  assert.equal(urlMatches("https://example.com/app/dashboard/reports?x=1", "https://example.com/app/dashboard*"), true);
});

test("rejects other paths and hosts", () => {
  assert.equal(urlMatches("https://example.com/app/settings", "https://example.com/app/dashboard*"), false);
  assert.equal(urlMatches("https://evil.example.com/app/dashboard", "https://example.com/app/dashboard*"), false);
});

test("treats regex characters as literals", () => {
  assert.equal(urlMatches("https://example.com/a+b", "https://example.com/a+b"), true);
  assert.equal(urlMatches("https://example.com/aab", "https://example.com/a+b"), false);
});

test("handles missing urls", () => {
  assert.equal(urlMatches(undefined, "https://example.com/*"), false);
  assert.equal(urlMatches("", "https://example.com/*"), false);
});
