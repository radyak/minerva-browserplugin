import assert from "node:assert/strict";
import test from "node:test";

import { matchPatternFor, urlMatches, urlOnPlatform } from "../src/core/url-matcher.js";

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

test("builds a match pattern from protocol + host", () => {
  assert.equal(matchPatternFor("https://www.biddr.com"), "https://www.biddr.com/*");
  assert.equal(matchPatternFor("https://www.biddr.com/"), "https://www.biddr.com/*");
  // Match patterns cannot carry a port.
  assert.equal(matchPatternFor("http://localhost:8080"), "http://localhost/*");
});

test("urlOnPlatform matches the origin and the path", () => {
  const paths = ["/live/g-m-auction", "/lots/*"];
  assert.equal(urlOnPlatform("https://www.biddr.com/live/g-m-auction", "https://www.biddr.com", paths), true);
  assert.equal(urlOnPlatform("https://www.biddr.com/live/g-m-auction?x=1#y", "https://www.biddr.com/", paths), true);
  assert.equal(urlOnPlatform("https://www.biddr.com/lots/42", "https://www.biddr.com", paths), true);
  assert.equal(urlOnPlatform("https://www.biddr.com/live/other", "https://www.biddr.com", paths), false);
  assert.equal(urlOnPlatform("https://www.biddr.com/live/g-m-auction/x", "https://www.biddr.com", paths), false);
});

test("urlOnPlatform rejects other origins", () => {
  const paths = ["/*"];
  assert.equal(urlOnPlatform("http://www.biddr.com/", "https://www.biddr.com", paths), false);
  assert.equal(urlOnPlatform("https://evil.biddr.com/", "https://www.biddr.com", paths), false);
  assert.equal(urlOnPlatform("https://www.biddr.com.evil.test/", "https://www.biddr.com", paths), false);
  assert.equal(urlOnPlatform("http://localhost:8081/", "http://localhost:8080", paths), false);
  assert.equal(urlOnPlatform("http://localhost:8080/", "http://localhost:8080", paths), true);
  assert.equal(urlOnPlatform(undefined, "https://www.biddr.com", paths), false);
  assert.equal(urlOnPlatform("not a url", "https://www.biddr.com", paths), false);
});
