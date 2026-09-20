import { MARKER_CLASS, TARGET_SELECTOR, TARGET_URL_PATTERN } from "./config.js";
import { urlMatches } from "./url-matcher.js";

/**
 * Browser agnostic DOM logic. Everything in here works against a plain
 * Document, which keeps it unit testable and identical on every browser.
 */

/**
 * Add the marker class to every element matching `selector`.
 * @returns {number} number of elements that were newly marked
 */
export function markElements(doc, selector = TARGET_SELECTOR) {
  let marked = 0;
  for (const element of doc.querySelectorAll(selector)) {
    if (!element.classList.contains(MARKER_CLASS)) {
      element.classList.add(MARKER_CLASS);
      marked += 1;
    }
  }
  return marked;
}

/**
 * Remove the marker class from every element that still carries it.
 * @returns {number} number of elements that were unmarked
 */
export function unmarkElements(doc) {
  const marked = doc.querySelectorAll(`.${MARKER_CLASS}`);
  for (const element of marked) {
    element.classList.remove(MARKER_CLASS);
  }
  return marked.length;
}

/** Should the extension be active on this URL? */
export function isTargetUrl(url) {
  return urlMatches(url, TARGET_URL_PATTERN);
}

/**
 * Bring the document in line with the current URL: mark when the URL is a
 * target URL, clean up otherwise.
 * @returns {{active: boolean, marked: number}}
 */
export function syncDocument(doc, url) {
  const active = isTargetUrl(url);
  if (!active) {
    unmarkElements(doc);
    return { active: false, marked: 0 };
  }
  markElements(doc);
  return { active: true, marked: doc.querySelectorAll(`.${MARKER_CLASS}`).length };
}
