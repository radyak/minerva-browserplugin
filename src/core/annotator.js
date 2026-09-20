import {
  ANNOTATION_CLASS,
  MARKUP_RATE,
  TARGET_SELECTOR,
  TARGET_URL_PATTERN,
  UNPARSABLE_TEXT,
} from "./config.js";
import { addMarkup } from "./price.js";
import { urlMatches } from "./url-matcher.js";

/**
 * Browser agnostic DOM logic: read the price out of the target element, add the
 * surcharge and keep a sibling element next to it in sync. Everything works
 * against a plain Document, which keeps it unit testable and identical on every
 * browser.
 */

/** The annotation belonging to `element`, if it was already inserted. */
function annotationOf(element) {
  const sibling = element.nextElementSibling;
  return sibling?.classList.contains(ANNOTATION_CLASS) ? sibling : null;
}

function createAnnotation(doc, element) {
  // Mirror the tag so the annotation flows the same way as the price itself.
  const annotation = doc.createElement(element.tagName);
  annotation.className = ANNOTATION_CLASS;
  annotation.setAttribute("aria-live", "polite");
  element.insertAdjacentElement("afterend", annotation);
  return annotation;
}

/**
 * Insert or refresh the surcharged price next to every matching element. An
 * element whose text holds no parsable price still gets its sibling, showing
 * UNPARSABLE_TEXT instead of an amount.
 * @returns {{annotated: number, unparsable: number}} counts after the run
 */
export function annotateElements(doc, { selector = TARGET_SELECTOR, rate = MARKUP_RATE } = {}) {
  let annotated = 0;
  let unparsable = 0;

  for (const element of doc.querySelectorAll(selector)) {
    // Never annotate our own output, even if the selector happens to match it.
    if (element.classList.contains(ANNOTATION_CLASS)) continue;

    const source = element.textContent.trim();
    const withMarkup = addMarkup(source, rate);
    const text = withMarkup ?? UNPARSABLE_TEXT;

    const annotation = annotationOf(element) ?? createAnnotation(doc, element);
    // Only touch the DOM on a real change, otherwise the MutationObserver in
    // the content script would keep waking itself up.
    if (annotation.textContent !== text) annotation.textContent = text;
    if (annotation.dataset.xbpSource !== source) annotation.dataset.xbpSource = source;
    // A styling hook, and what tells "no price here" apart from a real result.
    const unresolved = withMarkup === null ? "true" : undefined;
    if (annotation.dataset.xbpUnparsable !== unresolved) {
      if (unresolved) annotation.dataset.xbpUnparsable = unresolved;
      else delete annotation.dataset.xbpUnparsable;
    }

    annotated += 1;
    if (withMarkup === null) unparsable += 1;
  }

  return { annotated, unparsable };
}

/**
 * Remove every annotation this extension has inserted.
 * @returns {number} number of annotations that were removed
 */
export function removeAnnotations(doc) {
  const annotations = doc.querySelectorAll(`.${ANNOTATION_CLASS}`);
  for (const annotation of annotations) annotation.remove();
  return annotations.length;
}

/** Should the extension be active on this URL? */
export function isTargetUrl(url) {
  return urlMatches(url, TARGET_URL_PATTERN);
}

/**
 * Bring the document in line with the current URL: annotate when the URL is a
 * target URL, clean up otherwise.
 * @returns {{active: boolean, annotated: number, unparsable: number}}
 */
export function syncDocument(doc, url) {
  if (!isTargetUrl(url)) {
    removeAnnotations(doc);
    return { active: false, annotated: 0, unparsable: 0 };
  }
  return { active: true, ...annotateElements(doc) };
}
