import assert from "node:assert/strict";
import { test } from "vitest";

import { JSDOM } from "jsdom";

import { effectivePrice } from "../src/core/pricing/PriceCalculator.ts";
import { SITES } from "../src/core/sites/sites.config.ts";
import {
  defineSite,
  findSite,
  identify,
  matchPatternFor,
  matchPatterns,
} from "../src/core/sites/sites.ts";

const site = (origin, paths, ids = undefined) =>
  defineSite({ origin, paths, priceSelectors: [".p"], ...(ids && { ids }) });
/** Whether `url` is on a site of `origin` with these `paths`. */
const onSite = (url, origin, paths) => findSite([site(origin, paths)], url) !== null;

test("a path glob matches a prefix with *, exactly otherwise", () => {
  const paths = ["/live/g-m-auction", "/lots/*"];
  assert.equal(
    onSite("https://www.biddr.com/live/g-m-auction", "https://www.biddr.com", paths),
    true,
  );
  assert.equal(onSite("https://www.biddr.com/lots/42", "https://www.biddr.com", paths), true);
  assert.equal(onSite("https://www.biddr.com/lots/42/x?y=1", "https://www.biddr.com", paths), true);
  assert.equal(onSite("https://www.biddr.com/live/other", "https://www.biddr.com", paths), false);
  assert.equal(
    onSite("https://www.biddr.com/live/g-m-auction/x", "https://www.biddr.com", paths),
    false,
  );
});

test("query and hash are ignored, a trailing slash in the origin too", () => {
  const paths = ["/live/g-m-auction"];
  assert.equal(
    onSite("https://www.biddr.com/live/g-m-auction?x=1#y", "https://www.biddr.com/", paths),
    true,
  );
});

test("treats regex characters in paths as literals", () => {
  assert.equal(onSite("https://x.test/a+b", "https://x.test", ["/a+b"]), true);
  assert.equal(onSite("https://x.test/aab", "https://x.test", ["/a+b"]), false);
});

test("rejects other origins and missing urls", () => {
  const paths = ["/*"];
  assert.equal(onSite("http://www.biddr.com/", "https://www.biddr.com", paths), false);
  assert.equal(onSite("https://evil.biddr.com/", "https://www.biddr.com", paths), false);
  assert.equal(onSite("https://www.biddr.com.evil.test/", "https://www.biddr.com", paths), false);
  assert.equal(onSite("http://localhost:8081/", "http://localhost:8080", paths), false);
  assert.equal(onSite("http://localhost:8080/", "http://localhost:8080", paths), true);
  assert.equal(onSite(undefined, "https://www.biddr.com", paths), false);
  assert.equal(onSite("", "https://www.biddr.com", paths), false);
  assert.equal(onSite("not a url", "https://www.biddr.com", paths), false);
});

test("builds a match pattern from protocol + host", () => {
  assert.equal(matchPatternFor("https://www.biddr.com"), "https://www.biddr.com/*");
  assert.equal(matchPatternFor("https://www.biddr.com/"), "https://www.biddr.com/*");
  // Match patterns cannot carry a port.
  assert.equal(matchPatternFor("http://localhost:8080"), "http://localhost/*");
});

const TEST_SITES = [
  site("https://shop.test", ["/lot/*", "/search"]),
  site("https://other.test/", ["/*"]),
  site("https://other.test", ["/*"]),
];
const [SHOP, OTHER] = TEST_SITES;

test("findSite picks the first site whose origin and paths match the url", () => {
  assert.equal(findSite(TEST_SITES, "https://shop.test/lot/1"), SHOP);
  assert.equal(findSite(TEST_SITES, "https://shop.test/search?q=coin#top"), SHOP);
  assert.equal(findSite(TEST_SITES, "https://shop.test/search/saved"), null);
  // The first matching site wins.
  assert.equal(findSite(TEST_SITES, "https://other.test/x"), OTHER);
  // On the origin, but outside every path.
  assert.equal(findSite(TEST_SITES, "https://shop.test/account"), null);
  assert.equal(findSite(TEST_SITES, "https://not-the-target.invalid/"), null);
  assert.equal(findSite(TEST_SITES, undefined), null);
});

test("collects one match pattern per host", () => {
  assert.deepEqual(matchPatterns(TEST_SITES), ["https://shop.test/*", "https://other.test/*"]);
});

test("sites use the effective price calculation unless configured otherwise", () => {
  assert.equal(SHOP.calculator, effectivePrice);
  const calculator = () => 42;
  const custom = defineSite({
    origin: "https://x.test",
    paths: ["/*"],
    priceSelectors: [".p"],
    calculator,
  });
  assert.equal(custom.calculator, calculator);
});

test("reads an ID from a query parameter", () => {
  const ids = (url) => identify(site("https://x.test", ["/*"], { auction: { query: "a" } }), url);
  assert.equal(ids("https://x.test/h/auction?a=7522&l=9").auction, "7522");
  assert.equal(ids("https://x.test/h/auction?l=9").auction, null);
  assert.equal(ids("https://x.test/h/auction?a=").auction, null);
});

test("reads an ID from one path segment, the rest of the pattern being a glob", () => {
  const read = (path, url) =>
    identify(site("https://x.test", ["/*"], { auction: { path } }), url).auction;
  assert.equal(read("/sale/:id*", "https://x.test/sale/7123"), "7123");
  assert.equal(read("/sale/:id*", "https://x.test/sale/7123/lot/45?x=1"), "7123");
  assert.equal(read("/sale/:id*", "https://x.test/sale/"), null);
  assert.equal(read("/sale/:id*", "https://x.test/other/7123"), null);
  assert.equal(read("/:id/auction", "https://x.test/agorawien/auction?a=1"), "agorawien");
  assert.equal(read("/:id/auction", "https://x.test/auctions/calendar"), null);
  assert.equal(read("/:id/auction", "https://x.test/a%20b/auction"), "a b");
  // Regex characters in the pattern are literal.
  assert.equal(read("/a.b/:id", "https://x.test/axb/1"), null);
});

test("an ID path needs exactly one placeholder", () => {
  assert.throws(() => site("https://x.test", ["/*"], { auction: { path: "/sale/*" } }), /:id/);
  assert.throws(() => site("https://x.test", ["/*"], { house: { path: "/:id/:id" } }), /:id/);
});

test("a site identifies house and auction from the URL, as far as configured", () => {
  const leu = site("https://x.test", ["/*"], {
    house: { path: "/:id/auction" },
    auction: { query: "a" },
  });
  assert.deepEqual(identify(leu, "https://x.test/leu/auction?a=7"), { house: "leu", auction: "7" });
  assert.deepEqual(identify(leu, "https://x.test/leu/auction"), { house: "leu", auction: null });
  assert.deepEqual(identify(leu, "not a url"), { house: null, auction: null });
  // Without ids nothing is known.
  assert.deepEqual(identify(SHOP, "https://shop.test/lot/1?a=7"), { house: null, auction: null });
});

test("the configured sites identify their real URLs", () => {
  const ids = (url) => {
    const found = findSite(SITES, url);
    return found && identify(found, url);
  };
  assert.deepEqual(ids("https://www.biddr.com/agorawien/auction?a=7522&l=9222559"), {
    house: "agorawien",
    auction: "7522",
  });
  assert.deepEqual(ids("https://www.numisbids.com/sale/7123/lot/45"), {
    house: null,
    auction: "7123",
  });
});

test("every configured site is well formed", () => {
  assert.ok(SITES.length > 0);
  for (const site of SITES) {
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
    assert.ok(site.ids.auction, `${name}: ids.auction must be configured`);
    // Every selector must be valid CSS, otherwise querySelectorAll throws at runtime.
    const doc = new JSDOM("").window.document;
    for (const selector of site.priceSelectors) {
      doc.querySelectorAll(selector);
      // The annotation is inserted right after the price element, so anything counting
      // from the end stops matching it after the first run.
      assert.doesNotMatch(
        selector,
        /:(last-child|last-of-type|only-child|only-of-type|nth-last-child|nth-last-of-type)\b/,
        `${name}: "${selector}" depends on the elements after the price`,
      );
    }
  }
});
