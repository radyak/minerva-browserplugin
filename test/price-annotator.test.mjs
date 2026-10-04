import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { ANNOTATION_CLASS, UNPARSABLE_TEXT } from "../src/core/config.js";
import { PriceAnnotator } from "../src/core/annotation/PriceAnnotator.js";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.js";
import { PriceCalculator } from "../src/core/pricing/PriceCalculator.js";
import { Settings } from "../src/core/settings/Settings.js";
import { AuctionSite } from "../src/core/sites/AuctionSite.js";

const SELECTOR = ".price";
const SETTINGS = new Settings({ auctionPremium: 0, shipment: 100, currency: "EUR" });
// Into EUR; GBP deliberately has no rate.
const RATES = new ExchangeRates("EUR", "", { USD: 2 });

function documentWithPrice(price = "500 EUR") {
  return new JSDOM(`
    <div id="root">
      <span class="price">${price}</span>
      <span class="other">999 EUR</span>
    </div>
  `).window.document;
}

/**
 * Annotate `doc`'s prices as a site with these selectors (and calculator); the resulting counts.
 * @param {Document} doc
 * @param {string[]} [priceSelectors]
 * @param {import("../src/core/pricing/PriceCalculator.js").PriceCalculator} [calculator]
 */
const annotate = (doc, priceSelectors = [SELECTOR], calculator = undefined) => {
  const site = new AuctionSite({
    origin: "https://shop.test",
    paths: ["/*"],
    priceSelectors,
    calculator,
  });
  const { annotated, unparsable } = new PriceAnnotator(doc).annotate(site, SETTINGS, RATES);
  return { annotated, unparsable };
};
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
    assert.equal(annotations(doc)[0].dataset.minervaUnparsable, "true");
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
  assert.equal(annotation.dataset.minervaUnparsable, "true");
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
  assert.equal(annotation.dataset.minervaUnparsable, "true");

  doc.querySelector(SELECTOR).textContent = "700 EUR";
  assert.deepEqual(annotate(doc), { annotated: 1, unparsable: 0 });
  assert.equal(annotation.textContent, "800 EUR");
  assert.equal(annotation.dataset.minervaUnparsable, undefined, "the marker attribute is cleared");
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

test("the site's calculator works out the price", () => {
  class Doubling extends PriceCalculator {
    calculate(amount, currency, settings, rates) {
      return rates.convert(amount, currency) * 2 + settings.shipment;
    }
  }
  const doc = documentWithPrice();
  annotate(doc, [SELECTOR], new Doubling());
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

test("clear removes every annotation", () => {
  const doc = documentWithPrice();
  annotate(doc);
  assert.equal(new PriceAnnotator(doc).clear().active, false);
  assert.equal(annotations(doc).length, 0);
});

test("reports an active state with the counts", () => {
  const site = new AuctionSite({
    origin: "https://shop.test",
    paths: ["/*"],
    priceSelectors: [SELECTOR],
  });
  const state = new PriceAnnotator(documentWithPrice()).annotate(site, SETTINGS, RATES);
  assert.deepEqual(state.toJSON(), {
    active: true,
    annotated: 1,
    unparsable: 0,
    currencies: ["EUR"],
  });
});

test("reports the currencies of the prices, once each, also without a rate", () => {
  const doc = new JSDOM(`
    <span class="price">500 USD</span>
    <span class="price">£20</span>
    <span class="price">$7</span>
    <span class="price">sold out</span>
  `).window.document;
  const site = new AuctionSite({
    origin: "https://shop.test",
    paths: ["/*"],
    priceSelectors: [SELECTOR],
  });
  const state = new PriceAnnotator(doc).annotate(site, SETTINGS, RATES);
  assert.deepEqual(state.currencies, ["GBP", "USD"]);
});

test("an element matched by several selectors is annotated once", () => {
  const doc = documentWithPrice();
  assert.deepEqual(annotate(doc, [SELECTOR, "#root span"]), { annotated: 2, unparsable: 0 });
  assert.deepEqual(
    annotations(doc).map((annotation) => annotation.textContent),
    ["600 EUR", "1099 EUR"],
  );
});
