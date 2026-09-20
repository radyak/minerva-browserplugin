import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { MARKER_CLASS, TARGET_SELECTOR } from "../src/core/config.js";
import { markElements, syncDocument, unmarkElements } from "../src/core/marker.js";

const TARGET_URL = "https://example.com/app/dashboard";
const OTHER_URL = "https://example.com/app/settings";

function documentWithTarget() {
  // Build markup that satisfies TARGET_SELECTOR without hard coding it twice.
  return new JSDOM(`
    <div id="app-root">
      <div class="content-card" data-module="overview">target</div>
      <div class="content-card" data-module="other">not a target</div>
    </div>
  `).window.document;
}

test("marks only the configured element", () => {
  const doc = documentWithTarget();
  assert.equal(markElements(doc), 1);
  assert.equal(doc.querySelectorAll(`.${MARKER_CLASS}`).length, 1);
  assert.equal(doc.querySelector(`.${MARKER_CLASS}`).dataset.module, "overview");
});

test("marking is idempotent", () => {
  const doc = documentWithTarget();
  markElements(doc);
  assert.equal(markElements(doc), 0);
  assert.equal(doc.querySelectorAll(`.${MARKER_CLASS}`).length, 1);
});

test("unmark removes every marker", () => {
  const doc = documentWithTarget();
  markElements(doc);
  assert.equal(unmarkElements(doc), 1);
  assert.equal(doc.querySelectorAll(`.${MARKER_CLASS}`).length, 0);
});

test("sync activates on the target url and cleans up elsewhere", () => {
  const doc = documentWithTarget();
  assert.deepEqual(syncDocument(doc, TARGET_URL), { active: true, marked: 1 });
  assert.deepEqual(syncDocument(doc, OTHER_URL), { active: false, marked: 0 });
  assert.equal(doc.querySelectorAll(`.${MARKER_CLASS}`).length, 0);
});

test("selector and markup stay in sync", () => {
  assert.equal(documentWithTarget().querySelectorAll(TARGET_SELECTOR).length, 1);
});
