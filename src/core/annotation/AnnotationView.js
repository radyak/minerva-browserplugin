import { ANNOTATION_CLASS } from "../config.js";

/**
 * @typedef {object} Annotation
 * @property {string} text   what to show: the effective price or UNPARSABLE_TEXT
 * @property {string} source the price text it was computed from
 * @property {boolean} unresolved true when there is no result ("n/a")
 */

/**
 * The annotations in one document: the sibling elements carrying
 * ANNOTATION_CLASS that show the effective price next to a price element.
 * The only class that writes to the page.
 *
 * Every write happens only on a real change: the content script's
 * MutationObserver watches the whole document, so an unconditional write
 * would wake it up again and again.
 */
export class AnnotationView {
  /** @param {Document} doc */
  constructor(doc) {
    this.doc = doc;
  }

  /**
   * The elements matching any of `selectors`, each once - never our own
   * annotations, even if a selector happens to match them.
   * @param {readonly string[]} selectors
   * @returns {Element[]}
   */
  query(selectors) {
    return [...this.doc.querySelectorAll(selectors.join(", "))].filter(
      (element) => !element.closest(`.${ANNOTATION_CLASS}`),
    );
  }

  /**
   * The text of `element` without any of our annotations inside it - otherwise
   * our own output would be read back as part of the price.
   * @param {Element} element
   * @returns {string}
   */
  priceText(element) {
    if (!element.querySelector(`.${ANNOTATION_CLASS}`)) return element.textContent.trim();
    const copy = /** @type {Element} */ (element.cloneNode(true));
    for (const annotation of copy.querySelectorAll(`.${ANNOTATION_CLASS}`)) annotation.remove();
    return copy.textContent.trim();
  }

  /**
   * Show `annotation` next to `element`, inserting the sibling when missing.
   * @param {Element} element
   * @param {Annotation} annotation
   */
  show(element, { text, source, unresolved }) {
    const sibling = this.#annotationOf(element) ?? this.#insert(element);
    if (sibling.textContent !== text) sibling.textContent = text;
    if (sibling.dataset.minervaSource !== source) sibling.dataset.minervaSource = source;
    // A styling hook, and what tells "no price here" apart from a real result.
    if (unresolved && sibling.dataset.minervaUnparsable !== "true") {
      sibling.dataset.minervaUnparsable = "true";
    } else if (!unresolved && "minervaUnparsable" in sibling.dataset) {
      delete sibling.dataset.minervaUnparsable;
    }
  }

  /**
   * Remove the annotation next to `element`, if there is one.
   * @param {Element} element
   */
  removeFrom(element) {
    this.#annotationOf(element)?.remove();
  }

  /**
   * Remove every annotation in the document.
   * @returns {number} how many were removed
   */
  clear() {
    const annotations = this.doc.querySelectorAll(`.${ANNOTATION_CLASS}`);
    for (const annotation of annotations) annotation.remove();
    return annotations.length;
  }

  /**
   * @param {Element} element
   * @returns {HTMLElement | null}
   */
  #annotationOf(element) {
    const sibling = /** @type {HTMLElement | null} */ (element.nextElementSibling);
    return sibling?.classList.contains(ANNOTATION_CLASS) ? sibling : null;
  }

  /**
   * @param {Element} element
   * @returns {HTMLElement}
   */
  #insert(element) {
    // Mirror the tag so the annotation flows the same way as the price itself.
    const annotation = this.doc.createElement(element.tagName);
    annotation.className = ANNOTATION_CLASS;
    annotation.setAttribute("aria-live", "polite");
    element.insertAdjacentElement("afterend", annotation);
    return annotation;
  }
}
