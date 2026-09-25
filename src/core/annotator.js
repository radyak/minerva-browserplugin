import { ANNOTATION_CLASS, PLATFORMS, UNPARSABLE_TEXT } from "./config.js";
import { calculateEffectivePrice } from "./effective-price.js";
import { convertPrice } from "./price.js";
import { urlOnPlatform } from "./url-matcher.js";

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
 * element whose text holds no parsable price still gets its sibling, showing
 * UNPARSABLE_TEXT instead of an amount.
 * @param {Document} doc
 * @param {object} options
 * @param {string[]} options.selectors
 * @param {import("./settings.js").Settings} options.settings
 * @param {typeof calculateEffectivePrice} [options.calculate]
 * @returns {{annotated: number, unparsable: number}} counts after the run
 */
export function annotateElements(
  doc,
  { selectors, settings, calculate = calculateEffectivePrice },
) {
  let annotated = 0;
  let unparsable = 0;

  // One combined query, so an element matched by several selectors is only
  // visited once.
  for (const element of doc.querySelectorAll(selectors.join(", "))) {
    // Never annotate our own output, even if the selector happens to match it.
    if (element.classList.contains(ANNOTATION_CLASS)) continue;

    const source = element.textContent.trim();
    const converted = convertPrice(source, (amount) => calculate(amount, settings));
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
 * The platform the extension should act as on this URL: the first one whose
 * `platformUrl` origin matches and that has a matching entry in `platformPaths`.
 * @param {string | undefined | null} url
 * @param {import("./config.js").Platform[]} [platforms]
 * @returns {import("./config.js").Platform | null}
 */
export function findPlatform(url, platforms = PLATFORMS) {
  return (
    platforms.find((platform) =>
      urlOnPlatform(url, platform.platformUrl, platform.platformPaths),
    ) ?? null
  );
}

/** Should the extension be active on this URL? */
export function isTargetUrl(url, platforms = PLATFORMS) {
  return findPlatform(url, platforms) !== null;
}

/**
 * Bring the document in line with the current URL: annotate with the matching
 * platform's selectors and the user's settings, clean up when no platform
 * matches.
 * @param {Document} doc
 * @param {string} url
 * @param {import("./settings.js").Settings} settings
 * @param {import("./config.js").Platform[]} [platforms]
 * @returns {{active: boolean, annotated: number, unparsable: number}}
 */
export function syncDocument(doc, url, settings, platforms = PLATFORMS) {
  const platform = findPlatform(url, platforms);
  if (!platform) {
    removeAnnotations(doc);
    return { active: false, annotated: 0, unparsable: 0 };
  }
  return {
    active: true,
    ...annotateElements(doc, {
      selectors: platform.targetSelectors,
      settings,
    }),
  };
}
