import { ANNOTATION_CLASS, UNPARSABLE_TEXT } from "./config.js";
import { calculateEffectivePrice } from "./effective-price.js";
import { convertPrice } from "./price.js";
import { TabState } from "./state/TabState.js";
import { SITES } from "./sites/sites.config.js";

/**
 * Browser agnostic DOM logic: read the price out of the target element, work
 * out the effective price and keep a sibling element next to it in sync. Everything works
 * against a plain Document, which keeps it unit testable and identical on every
 * browser.
 */

/** The annotation belonging to `element`, if it was already inserted. */
function annotationOf(element) {
  const sibling = element.nextElementSibling;
  return sibling?.classList.contains(ANNOTATION_CLASS) ? sibling : null;
}

/**
 * The text of `element` without any of our annotations inside it - otherwise
 * our own output would be read back as part of the price.
 */
function priceText(element) {
  if (!element.querySelector(`.${ANNOTATION_CLASS}`)) return element.textContent.trim();
  const copy = element.cloneNode(true);
  for (const annotation of copy.querySelectorAll(`.${ANNOTATION_CLASS}`)) annotation.remove();
  return copy.textContent.trim();
}

/**
 * The matches that wrap another match. Only the innermost element holds the
 * price itself; annotating the wrapper too would show the price twice (and
 * read the inner annotation back as part of its text).
 * @param {Element[]} matches
 * @returns {Set<Element>}
 */
function findWrappers(matches) {
  const matched = new Set(matches);
  const wrappers = new Set();
  for (const element of matches) {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (matched.has(parent)) wrappers.add(parent);
    }
  }
  return wrappers;
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
 * Insert or refresh the effective price next to every matching element. An
 * element whose text holds no parsable price - or one in a currency that is
 * unknown or has no rate - still gets its sibling, showing UNPARSABLE_TEXT
 * instead of an amount.
 * @param {Document} doc
 * @param {object} options
 * @param {readonly string[]} options.selectors
 * @param {import("./settings/Settings.js").Settings} options.settings
 * @param {import("./rates/ExchangeRates.js").ExchangeRates} options.rates base `settings.currency`
 * @param {typeof calculateEffectivePrice} [options.calculate]
 * @returns {{annotated: number, unparsable: number}} counts after the run
 */
export function annotateElements(
  doc,
  { selectors, settings, rates, calculate = calculateEffectivePrice },
) {
  let annotated = 0;
  let unparsable = 0;

  // One combined query, so an element matched by several selectors is only
  // visited once. Never annotate our own output, even if a selector happens
  // to match it.
  const matches = [...doc.querySelectorAll(selectors.join(", "))].filter(
    (element) => !element.closest(`.${ANNOTATION_CLASS}`),
  );
  const wrappers = findWrappers(matches);

  for (const element of matches) {
    if (wrappers.has(element)) {
      // Drop what an earlier run may have put next to it (only on change).
      annotationOf(element)?.remove();
      continue;
    }

    const source = priceText(element);
    const converted = convertPrice(
      source,
      (amount, currency) => calculate(amount, currency, settings, rates),
      settings.currency,
    );
    const text = converted ?? UNPARSABLE_TEXT;

    const annotation = annotationOf(element) ?? createAnnotation(doc, element);
    // Only touch the DOM on a real change, otherwise the MutationObserver in
    // the content script would keep waking itself up.
    if (annotation.textContent !== text) annotation.textContent = text;
    if (annotation.dataset.xbpSource !== source) annotation.dataset.xbpSource = source;
    // A styling hook, and what tells "no price here" apart from a real result.
    const unresolved = converted === null ? "true" : undefined;
    if (annotation.dataset.xbpUnparsable !== unresolved) {
      if (unresolved) annotation.dataset.xbpUnparsable = unresolved;
      else delete annotation.dataset.xbpUnparsable;
    }

    annotated += 1;
    if (converted === null) unparsable += 1;
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

/**
 * Bring the document in line with the current URL: annotate with the matching
 * site's price selectors and the user's settings, clean up when no site
 * matches.
 * @param {Document} doc
 * @param {string} url
 * @param {import("./settings/Settings.js").Settings} settings
 * @param {import("./rates/ExchangeRates.js").ExchangeRates} rates base `settings.currency`
 * @param {import("./sites/SiteRegistry.js").SiteRegistry} [sites]
 * @returns {TabState}
 */
export function syncDocument(doc, url, settings, rates, sites = SITES) {
  const site = sites.find(url);
  if (!site) {
    removeAnnotations(doc);
    return TabState.inactive();
  }
  const counts = annotateElements(doc, { selectors: site.priceSelectors, settings, rates });
  return new TabState({ active: true, ...counts });
}
