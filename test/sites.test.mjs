import assert from "node:assert/strict";
import test from "node:test";

import { JSDOM } from "jsdom";

import { AuctionSite } from "../src/core/sites/AuctionSite.js";
import { SiteRegistry } from "../src/core/sites/SiteRegistry.js";
import { SITES } from "../src/core/sites/sites.config.js";
import { matchPatternFor, urlMatches, urlOnOrigin } from "../src/core/sites/url-matcher.js";

test("matches a plain prefix glob", () => {
  assert.equal(
    urlMatches("https://example.com/app/dashboard", "https://example.com/app/dashboard*"),
    true,
  );
  assert.equal(
    urlMatches(
      "https://example.com/app/dashboard/reports?x=1",
      "https://example.com/app/dashboard*",
    ),
    true,
  );
});

test("rejects other paths and hosts", () => {
  assert.equal(
    urlMatches("https://example.com/app/settings", "https://example.com/app/dashboard*"),
    false,
  );
  assert.equal(
    urlMatches("https://evil.example.com/app/dashboard", "https://example.com/app/dashboard*"),
    false,
  );
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

test("urlOnOrigin matches the origin and the path", () => {
  const paths = ["/live/g-m-auction", "/lots/*"];
  assert.equal(
    urlOnOrigin("https://www.biddr.com/live/g-m-auction", "https://www.biddr.com", paths),
    true,
  );
  assert.equal(
    urlOnOrigin("https://www.biddr.com/live/g-m-auction?x=1#y", "https://www.biddr.com/", paths),
    true,
  );
  assert.equal(urlOnOrigin("https://www.biddr.com/lots/42", "https://www.biddr.com", paths), true);
  assert.equal(
    urlOnOrigin("https://www.biddr.com/live/other", "https://www.biddr.com", paths),
    false,
  );
  assert.equal(
    urlOnOrigin("https://www.biddr.com/live/g-m-auction/x", "https://www.biddr.com", paths),
    false,
  );
});

test("urlOnOrigin rejects other origins", () => {
  const paths = ["/*"];
  assert.equal(urlOnOrigin("http://www.biddr.com/", "https://www.biddr.com", paths), false);
  assert.equal(urlOnOrigin("https://evil.biddr.com/", "https://www.biddr.com", paths), false);
  assert.equal(
    urlOnOrigin("https://www.biddr.com.evil.test/", "https://www.biddr.com", paths),
    false,
  );
  assert.equal(urlOnOrigin("http://localhost:8081/", "http://localhost:8080", paths), false);
  assert.equal(urlOnOrigin("http://localhost:8080/", "http://localhost:8080", paths), true);
  assert.equal(urlOnOrigin(undefined, "https://www.biddr.com", paths), false);
  assert.equal(urlOnOrigin("not a url", "https://www.biddr.com", paths), false);
});

const TEST_SITES = new SiteRegistry([
  new AuctionSite({
    origin: "https://shop.test",
    paths: ["/lot/*", "/search"],
    priceSelectors: [".a"],
  }),
  new AuctionSite({ origin: "https://other.test/", paths: ["/*"], priceSelectors: [".b"] }),
  new AuctionSite({ origin: "https://other.test", paths: ["/*"], priceSelectors: [".c"] }),
]);
const [SHOP, OTHER] = TEST_SITES.sites;

test("find picks the site whose origin and paths match the url", () => {
  assert.equal(TEST_SITES.find("https://shop.test/lot/1"), SHOP);
  // Query and hash are ignored.
  assert.equal(TEST_SITES.find("https://shop.test/search?q=coin#top"), SHOP);
  assert.equal(TEST_SITES.find("https://shop.test/search/saved"), null);
  // The first matching site wins.
  assert.equal(TEST_SITES.find("https://other.test/x"), OTHER);
  // On the origin, but outside every path.
  assert.equal(TEST_SITES.find("https://shop.test/account"), null);
  assert.equal(TEST_SITES.find("https://not-the-target.invalid/"), null);
  assert.equal(TEST_SITES.find(undefined), null);
});

test("isTarget tells whether any site matches", () => {
  assert.equal(TEST_SITES.isTarget("https://shop.test/lot/1"), true);
  assert.equal(TEST_SITES.isTarget("https://not-the-target.invalid/"), false);
});

test("collects one match pattern per host", () => {
  assert.deepEqual(TEST_SITES.matchPatterns(), ["https://shop.test/*", "https://other.test/*"]);
  assert.equal(SHOP.matchPattern, "https://shop.test/*");
});

test("sites are immutable", () => {
  assert.throws(() => {
    /** @type {any} */ (SHOP.paths).push("/x");
  }, TypeError);
  assert.throws(() => {
    /** @type {any} */ (TEST_SITES.sites).push(SHOP);
  }, TypeError);
});

test("every configured site is well formed", () => {
  assert.ok(SITES.sites.length > 0);
  for (const site of SITES.sites) {
    const name = site.origin;
    const url = new URL(site.origin);
    assert.ok(
      url.pathname === "/" && !url.search && !url.hash && !url.username,
      `${name}: origin must be protocol + host only`,
    );
    assert.ok(site.paths.length > 0, name);
    for (const path of site.paths) {
      assert.match(path, /^\//, `${name}: "${path}" must be a path starting with "/"`);
    }
    assert.ok(site.priceSelectors.length > 0, name);
    // Every selector must be valid CSS, otherwise querySelectorAll throws at runtime.
    const doc = new JSDOM("").window.document;
    for (const selector of site.priceSelectors) doc.querySelectorAll(selector);
  }
});
