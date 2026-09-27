import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { ANNOTATION_CLASS, PLATFORMS, UNPARSABLE_TEXT } from "../src/core/config.js";
import {
  annotateElements,
  findPlatform,
  isTargetUrl,
  removeAnnotations,
  syncDocument,
} from "../src/core/annotator.js";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.js";

/**
 * Everything is tested against platforms of our own so the suite keeps working
 * whatever PLATFORMS is configured; the real configuration only gets a shape
 * check at the end.
 */
const SELECTOR = ".price";
const SETTINGS = { auctionPremium: 0, shipment: 100, currency: "EUR" };
// Into EUR; GBP deliberately has no rate.
const RATES = new ExchangeRates("EUR", "", { USD: 2 });
const TARGET_URL = "https://shop.test/lot/1";
const OTHER_URL = "https://not-the-target.invalid/";

const TEST_PLATFORMS = [
  {
    platformUrl: "https://shop.test",
    platformPaths: ["/lot/*", "/search"],
    targetSelectors: [SELECTOR],
  },
  {
    platformUrl: "https://other.test/",
    platformPaths: ["/*"],
    targetSelectors: [".other"],
  },
];

function documentWithPrice(price = "500 EUR") {
  return new JSDOM(`
    <div id="root">
      <span class="price">${price}</span>
      <span class="other">999 EUR</span>
    </div>
  `).window.document;
}

const annotate = (doc) =>
  annotateElements(doc, { selectors: [SELECTOR], settings: SETTINGS, rates: RATES });
const annotations = (doc) => [...doc.querySelectorAll(`.${ANNOTATION_CLASS}`)];

test("appends the effective price as a sibling of the target element", () => {
  const doc = documentWithPrice();
  assert.deepEqual(annotate(doc), { annotated: 1, unparsable: 0 });

  const [annotation] = annotations(doc);
  assert.equal(annotation.textContent, "600 EUR");
  assert.equal(annotation.tagName, "SPAN"); // mirrors the price element
  assert.equal(doc.querySelector(SELECTOR).nextElementSibling, annotation);
  assert.equal(doc.querySelector(".other").textContent, "999 EUR");
});

test("leaves the price element itself untouched", () => {
  const doc = documentWithPrice("USD 1.359");
  annotate(doc);
  assert.equal(doc.querySelector(SELECTOR).textContent, "USD 1.359");
  // 1359 USD * 0.5 + 100 EUR shipment, written in the input's notation.
  assert.equal(annotations(doc)[0].textContent, "EUR 779,50");
});

for (const price of ["GBP 500", "500", "¥500"]) {
  test(`shows n/a for "${price}", which has no known currency or rate`, () => {
    const doc = documentWithPrice(price);
    assert.deepEqual(annotate(doc), { annotated: 1, unparsable: 1 });
    assert.equal(annotations(doc)[0].textContent, UNPARSABLE_TEXT);
    assert.equal(annotations(doc)[0].dataset.xbpUnparsable, "true");
  });
}

test("updates the sibling when the price changes", () => {
  const doc = documentWithPrice("500 EUR");
  annotate(doc);
  const [annotation] = annotations(doc);

  doc.querySelector(SELECTOR).textContent = "700 EUR";
  assert.deepEqual(annotate(doc), { annotated: 1, unparsable: 0 });

  assert.equal(annotations(doc).length, 1, "no second annotation is inserted");
  assert.equal(annotations(doc)[0], annotation, "the existing element is reused");
  assert.equal(annotation.textContent, "800 EUR");
});

test("falls back to n/a when the text holds no price", () => {
  const doc = documentWithPrice("sold out");
  assert.deepEqual(annotate(doc), { annotated: 1, unparsable: 1 });

  const [annotation] = annotations(doc);
  assert.equal(annotation.textContent, UNPARSABLE_TEXT);
  assert.equal(annotation.dataset.xbpUnparsable, "true");
  assert.equal(doc.querySelector(SELECTOR).nextElementSibling, annotation);
});

test("switches between n/a and a price as the text changes", () => {
  const doc = documentWithPrice();
  annotate(doc);
  const [annotation] = annotations(doc);

  doc.querySelector(SELECTOR).textContent = "sold out";
  assert.deepEqual(annotate(doc), { annotated: 1, unparsable: 1 });
  assert.equal(annotations(doc).length, 1, "no second annotation is inserted");
  assert.equal(annotation.textContent, UNPARSABLE_TEXT);
  assert.equal(annotation.dataset.xbpUnparsable, "true");

  doc.querySelector(SELECTOR).textContent = "700 EUR";
  assert.deepEqual(annotate(doc), { annotated: 1, unparsable: 0 });
  assert.equal(annotation.textContent, "800 EUR");
  assert.equal(annotation.dataset.xbpUnparsable, undefined, "the marker attribute is cleared");
});

for (const price of ["500 EUR", "sold out"]) {
  test(`re-running on "${price}" does not touch the DOM`, () => {
    const doc = documentWithPrice(price);
    annotate(doc);
    let writes = 0;
    new doc.defaultView.MutationObserver(() => {
      writes += 1;
    }).observe(doc.documentElement, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });

    annotate(doc);
    assert.equal(writes, 0);
  });
}

test("a custom calculation replaces the default one", () => {
  const doc = documentWithPrice();
  annotateElements(doc, {
    selectors: [SELECTOR],
    settings: SETTINGS,
    rates: RATES,
    calculate: (amount, currency, settings, rates) =>
      rates.convert(amount, currency) * 2 + settings.shipment,
  });
  assert.equal(annotations(doc)[0].textContent, "1100 EUR");
});

test("nested matches: only the innermost element is annotated", () => {
  const doc = new JSDOM(`
    <div class="price"><span class="price"><span class="price">500 USD</span></span></div>
  `).window.document;
  assert.deepEqual(annotate(doc), { annotated: 1, unparsable: 0 });
  assert.deepEqual(
    annotations(doc).map((annotation) => annotation.textContent),
    ["350 EUR"],
  );
  // Stable on re-runs, the inner annotation is never read back as a price.
  assert.deepEqual(annotate(doc), { annotated: 1, unparsable: 0 });
  assert.equal(annotations(doc).length, 1);
});

test("a wrapper's annotation from an earlier run is removed", () => {
  const doc = documentWithPrice("500 USD");
  annotate(doc);
  // The page wraps the price into another matching element later on.
  const price = doc.querySelector(SELECTOR);
  const wrapper = doc.createElement("span");
  wrapper.className = "price";
  price.before(wrapper);
  wrapper.append(price, price.nextElementSibling);
  wrapper.insertAdjacentHTML("afterend", `<span class="${ANNOTATION_CLASS}">stale</span>`);

  assert.deepEqual(annotate(doc), { annotated: 1, unparsable: 0 });
  assert.deepEqual(
    annotations(doc).map((annotation) => annotation.textContent),
    ["350 EUR"],
  );
});

test("our annotations inside a matched element are not part of its price", () => {
  const doc = documentWithPrice("500 EUR");
  doc
    .querySelector(SELECTOR)
    .insertAdjacentHTML("beforeend", `<span class="${ANNOTATION_CLASS}">999 USD</span>`);
  annotate(doc);
  assert.equal(doc.querySelector(SELECTOR).nextElementSibling.textContent, "600 EUR");
});

test("removeAnnotations cleans up everything", () => {
  const doc = documentWithPrice();
  annotate(doc);
  assert.equal(removeAnnotations(doc), 1);
  assert.equal(annotations(doc).length, 0);
});

test("an element matched by several selectors is annotated once", () => {
  const doc = documentWithPrice();
  const result = annotateElements(doc, {
    selectors: [SELECTOR, "#root span"],
    settings: SETTINGS,
    rates: RATES,
  });
  assert.deepEqual(result, { annotated: 2, unparsable: 0 });
  assert.deepEqual(
    annotations(doc).map((annotation) => annotation.textContent),
    ["600 EUR", "1099 EUR"],
  );
});

test("findPlatform picks the platform whose paths match the url", () => {
  assert.equal(findPlatform(TARGET_URL, TEST_PLATFORMS), TEST_PLATFORMS[0]);
  // Query and hash are not part of the path.
  assert.equal(
    findPlatform("https://shop.test/search?q=coin#top", TEST_PLATFORMS),
    TEST_PLATFORMS[0],
  );
  assert.equal(findPlatform("https://shop.test/search/saved", TEST_PLATFORMS), null);
  assert.equal(findPlatform("https://other.test/x", TEST_PLATFORMS), TEST_PLATFORMS[1]);
  // Inside platformUrl, but outside every platformPaths entry.
  assert.equal(findPlatform("https://shop.test/account", TEST_PLATFORMS), null);
  assert.equal(findPlatform(OTHER_URL, TEST_PLATFORMS), null);
  assert.equal(findPlatform(undefined, TEST_PLATFORMS), null);
  assert.equal(isTargetUrl(TARGET_URL, TEST_PLATFORMS), true);
  assert.equal(isTargetUrl(OTHER_URL, TEST_PLATFORMS), false);
});

test("sync uses the selectors of the matching platform", () => {
  const doc = documentWithPrice();
  assert.deepEqual(syncDocument(doc, "https://other.test/", SETTINGS, RATES, TEST_PLATFORMS), {
    active: true,
    annotated: 1,
    unparsable: 0,
  });
  assert.equal(doc.querySelector(".other").nextElementSibling.textContent, "1099 EUR");
  assert.equal(doc.querySelector(SELECTOR).nextElementSibling.className, "other");
});

test("sync only runs on the configured url", () => {
  const doc = documentWithPrice();
  assert.equal(syncDocument(doc, TARGET_URL, SETTINGS, RATES, TEST_PLATFORMS).active, true);
  assert.equal(syncDocument(doc, OTHER_URL, SETTINGS, RATES, TEST_PLATFORMS).active, false);

  // Whatever an earlier run left behind is cleaned up off the target URL.
  doc
    .querySelector(SELECTOR)
    .insertAdjacentHTML("afterend", `<span class="${ANNOTATION_CLASS}">600 EUR</span>`);
  assert.deepEqual(syncDocument(doc, OTHER_URL, SETTINGS, RATES, TEST_PLATFORMS), {
    active: false,
    annotated: 0,
    unparsable: 0,
  });
  assert.equal(annotations(doc).length, 0);
});

test("every configured platform is well formed", () => {
  assert.ok(PLATFORMS.length > 0);
  for (const platform of PLATFORMS) {
    const name = platform.platformUrl;
    const url = new URL(platform.platformUrl);
    assert.ok(
      url.pathname === "/" && !url.search && !url.hash && !url.username,
      `${name}: platformUrl must be protocol + host only`,
    );
    assert.ok(Array.isArray(platform.platformPaths) && platform.platformPaths.length > 0, name);
    for (const path of platform.platformPaths) {
      assert.match(path, /^\//, `${name}: "${path}" must be a path starting with "/"`);
    }
    assert.ok(Array.isArray(platform.targetSelectors) && platform.targetSelectors.length > 0, name);
    // Every selector must be valid CSS, otherwise querySelectorAll throws at runtime.
    const doc = new JSDOM("").window.document;
    for (const selector of platform.targetSelectors) doc.querySelectorAll(selector);
  }
});
