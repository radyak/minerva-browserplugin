import { ANNOTATION_CLASS } from "../config.ts";

export interface Annotation {
  /** what to show: the effective price or UNPARSABLE_TEXT */
  text: string;
  /** the price text it was computed from */
  source: string;
  /** true when there is no result ("n/a") */
  unresolved: boolean;
}

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
  readonly doc: Document;

  constructor(doc: Document) {
    this.doc = doc;
  }

  /**
   * The elements matching any of `selectors`, each once - never our own
   * annotations, even if a selector happens to match them.
   */
  query(selectors: readonly string[]): Element[] {
    return [...this.doc.querySelectorAll(selectors.join(", "))].filter(
      (element) => !element.closest(`.${ANNOTATION_CLASS}`),
    );
  }

  /**
   * The text of `element` without any of our annotations inside it - otherwise
   * our own output would be read back as part of the price.
   */
  priceText(element: Element): string {
    if (!element.querySelector(`.${ANNOTATION_CLASS}`)) return element.textContent.trim();
    const copy = element.cloneNode(true) as Element;
    for (const annotation of copy.querySelectorAll(`.${ANNOTATION_CLASS}`)) annotation.remove();
    return copy.textContent.trim();
  }

  /**
   * Show `annotation` next to `element`, inserting the sibling when missing.
   */
  show(element: Element, { text, source, unresolved }: Annotation) {
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
   * Remove every annotation that does not sit next to one of `elements` - left
   * over from an element that is no longer annotated (a wrapper now, or not
   * matched any more). Removes nothing when there is no such annotation.
   */
  removeAllBut(elements: Iterable<Element>) {
    const kept: Set<Element | null> = new Set(
      [...elements].map((element) => this.#annotationOf(element)),
    );
    for (const annotation of this.doc.querySelectorAll(`.${ANNOTATION_CLASS}`)) {
      if (!kept.has(annotation)) annotation.remove();
    }
  }

  /**
   * Remove every annotation in the document.
   * @returns how many were removed
   */
  clear(): number {
    const annotations = this.doc.querySelectorAll(`.${ANNOTATION_CLASS}`);
    for (const annotation of annotations) annotation.remove();
    return annotations.length;
  }

  #annotationOf(element: Element): HTMLElement | null {
    const sibling = element.nextElementSibling as HTMLElement | null;
    return sibling?.classList.contains(ANNOTATION_CLASS) ? sibling : null;
  }

  #insert(element: Element): HTMLElement {
    // Mirror the tag so the annotation flows the same way as the price itself.
    const annotation = this.doc.createElement(element.tagName);
    annotation.className = ANNOTATION_CLASS;
    annotation.setAttribute("aria-live", "polite");
    element.insertAdjacentElement("afterend", annotation);
    return annotation;
  }
}
