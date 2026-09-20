import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { ANNOTATION_CLASS, TARGET_URL_PATTERN, UNPARSABLE_TEXT } from "../src/core/config.js";
import { annotateElements, removeAnnotations, syncDocument } from "../src/core/annotator.js";

/**
 * The DOM behaviour is tested against a selector of our own so the suite keeps
 * working whatever TARGET_SELECTOR is configured; only the URL gating is
 * derived from the real configuration.
 */
const SELECTOR = ".price";
const TARGET_URL = TARGET_URL_PATTERN.replaceAll("*", "");
const OTHER_URL = "https://not-the-target.invalid/";

function documentWithPrice(price = "500 EUR") {
  return new JSDOM(`
    <div id="root">
      <span class="price">${price}</span>
      <span class="other">999 EUR</span>
    </div>
  `).window.document;
}

const annotate = (doc) => annotateElements(doc, { selector: SELECTOR });
const annotations = (doc) => [...doc.querySelectorAll(`.${ANNOTATION_CLASS}`)];

test("appends the surcharged price as a sibling of the target element", () => {
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
  assert.equal(annotations(doc)[0].textContent, "USD 1.630,80");
});

test("updates the sibling when the price changes", () => {
  const doc = documentWithPrice("500 EUR");
  annotate(doc);
  const [annotation] = annotations(doc);

  doc.querySelector(SELECTOR).textContent = "700 EUR";
  assert.deepEqual(annotate(doc), { annotated: 1, unparsable: 0 });

  assert.equal(annotations(doc).length, 1, "no second annotation is inserted");
  assert.equal(annotations(doc)[0], annotation, "the existing element is reused");
  assert.equal(annotation.textContent, "840 EUR");
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
  assert.equal(annotation.textContent, "840 EUR");
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

test("removeAnnotations cleans up everything", () => {
  const doc = documentWithPrice();
  annotate(doc);
  assert.equal(removeAnnotations(doc), 1);
  assert.equal(annotations(doc).length, 0);
});

test("sync only runs on the configured url", () => {
  const doc = documentWithPrice();
  assert.equal(syncDocument(doc, TARGET_URL).active, true, `${TARGET_URL} should match`);
  assert.equal(syncDocument(doc, OTHER_URL).active, false);

  // Whatever an earlier run left behind is cleaned up off the target URL.
  doc.querySelector(SELECTOR).insertAdjacentHTML(
    "afterend",
    `<span class="${ANNOTATION_CLASS}">600 EUR</span>`,
  );
  assert.deepEqual(syncDocument(doc, OTHER_URL), {
    active: false,
    annotated: 0,
    unparsable: 0,
  });
  assert.equal(annotations(doc).length, 0);
});
