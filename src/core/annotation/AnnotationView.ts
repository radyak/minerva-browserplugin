import { ANNOTATION_CLASS, POPUP_CLASS } from "../config.ts";

export interface Annotation {
  /** what to show: the effective price or UNPARSABLE_TEXT */
  text: string;
  /** the price text it was computed from */
  source: string;
  /** true when there is no result ("n/a") */
  unresolved: boolean;
}

/**
 * How the annotation lines up with its price element: on a line of its own,
 * centred or at the right, like the element's text (`data-minerva-align`,
 * styled by content.css); null to simply follow it in the flow.
 */
export type Alignment = "center" | "right" | null;

/**
 * Tags not to copy for the annotation: it would become a focusable control
 * that does nothing (and pick up the page's styles for its controls).
 */
const INTERACTIVE = new Set([
  "A",
  "BUTTON",
  "INPUT",
  "LABEL",
  "OPTION",
  "SELECT",
  "SUMMARY",
  "TEXTAREA",
]);

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
   * annotations or the pop-up, even if a selector happens to match them.
   */
  query(selectors: readonly string[]): Element[] {
    return [...this.doc.querySelectorAll(selectors.join(", "))].filter(
      (element) => !element.closest(`.${ANNOTATION_CLASS}, .${POPUP_CLASS}`),
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
    const align = this.alignment(element);
    if (align && sibling.dataset.minervaAlign !== align) {
      sibling.dataset.minervaAlign = align;
    } else if (!align && "minervaAlign" in sibling.dataset) {
      delete sibling.dataset.minervaAlign;
    }
  }

  /**
   * How the annotation of `element` lines up with it. An element taking the
   * whole width of its container (a block, a full-width button) gets its
   * annotation on the line below, aligned like its own text - a centred price
   * gets a centred bubble. Anything narrower is simply followed by it.
   */
  alignment(element: Element): Alignment {
    const view = this.doc.defaultView;
    const parent = element.parentElement;
    if (!view || !parent) return null;
    const style = view.getComputedStyle(element);
    if (style.display === "inline" || style.display === "contents") return null;
    const align = style.textAlign.replace(/^-webkit-/, "");
    const rtl = style.direction === "rtl";
    const side =
      align === "center"
        ? "center"
        : align === "right" || (align === "end" && !rtl) || (align === "start" && rtl)
          ? "right"
          : null;
    if (!side) return null;
    // As wide as the container's content box, margins included (1px for rounding).
    const box = view.getComputedStyle(parent);
    const available =
      parent.clientWidth - parseFloat(box.paddingLeft || "0") - parseFloat(box.paddingRight || "0");
    const used =
      element.getBoundingClientRect().width +
      parseFloat(style.marginLeft || "0") +
      parseFloat(style.marginRight || "0");
    return used >= available - 1 ? side : null;
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
    // Mirror the tag so the annotation flows the same way as the price itself -
    // except for controls: a price on a button gets a plain span.
    const tag = INTERACTIVE.has(element.tagName) ? "span" : element.tagName;
    const annotation = this.doc.createElement(tag);
    annotation.className = ANNOTATION_CLASS;
    annotation.setAttribute("aria-live", "polite");
    // Opens the pop-up explaining the price (ContentController listens).
    annotation.setAttribute("role", "button");
    annotation.setAttribute("tabindex", "0");
    annotation.setAttribute("aria-haspopup", "dialog");
    annotation.title = "How this price adds up";
    element.insertAdjacentElement("afterend", annotation);
    return annotation;
  }
}
