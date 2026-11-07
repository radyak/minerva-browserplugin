import { POPUP_CLASS } from "../config.ts";
import type { Explanation } from "../pricing/explainPrice.ts";

/** What the pop-up shows about the price of its annotation. */
export type PopupContent = {
  /** the price as read from the page */
  readonly source: string;
  readonly explanation: Explanation;
};

/** Room between the annotation and the pop-up, and to the edges of the window, in px. */
const GAP = 6;
const MARGIN = 8;

/**
 * The one pop-up explaining how the price of an annotation adds up. It floats
 * above the page (`position: fixed`, appended to the body) next to the
 * annotation it was opened for, so the page's layout never changes; opening
 * it for another annotation moves it there.
 *
 * Like AnnotationView it only writes on a real change - the content script's
 * MutationObserver watches the whole document.
 */
export class BreakdownPopup {
  readonly doc: Document;
  #element: HTMLElement | null = null;
  #anchor: HTMLElement | null = null;
  /** what is rendered, to tell a real change */
  #rendered: string | null = null;

  constructor(doc: Document) {
    this.doc = doc;
  }

  /** The annotation the pop-up is open for; null while closed. */
  get anchor(): HTMLElement | null {
    return this.#anchor;
  }

  /** Attach the pop-up to `anchor` (an annotation); `show()` fills it. */
  open(anchor: HTMLElement): void {
    this.#anchor = anchor;
  }

  /**
   * Show `content` next to the annotation it is open for, creating the pop-up
   * when needed. Does nothing while closed.
   */
  show(content: PopupContent): void {
    if (!this.#anchor) return;
    const element = this.#element ?? this.#create();
    if (!element.isConnected) this.doc.body.append(element);
    const rendered = JSON.stringify(content);
    if (rendered !== this.#rendered) {
      this.#rendered = rendered;
      this.#render(element, content);
    }
    this.place();
  }

  /**
   * Move the pop-up below its annotation - above it when there is no room
   * below - within the window. Called again on scroll and resize, as the
   * pop-up is placed in window coordinates.
   */
  place(): void {
    const element = this.#element;
    const view = this.doc.defaultView;
    if (!element || !this.#anchor || !view) return;
    const anchor = this.#anchor.getBoundingClientRect();
    const { width, height } = element.getBoundingClientRect();
    const below = anchor.bottom + GAP;
    const above = anchor.top - GAP - height;
    const top = below + height > view.innerHeight - MARGIN && above >= MARGIN ? above : below;
    const left = Math.max(MARGIN, Math.min(anchor.left, view.innerWidth - width - MARGIN));
    setStyle(element, "top", `${Math.round(top)}px`);
    setStyle(element, "left", `${Math.round(left)}px`);
  }

  /** Remove the pop-up from the page. */
  close(): void {
    this.#anchor = null;
    this.#rendered = null;
    this.#element?.remove();
    this.#element = null;
  }

  #create(): HTMLElement {
    const element = this.doc.createElement("div");
    element.className = POPUP_CLASS;
    element.setAttribute("role", "dialog");
    element.setAttribute("aria-label", "How this price adds up");
    this.#element = element;
    return element;
  }

  #render(element: HTMLElement, { source, explanation }: PopupContent): void {
    const doc = this.doc;
    const part = (className: string, text = "") => {
      const div = doc.createElement("div");
      div.className = `${POPUP_CLASS}-${className}`;
      div.textContent = text;
      return div;
    };

    const header = part("header");
    header.append(part("title", "How this price adds up"));
    const close = doc.createElement("button");
    close.type = "button";
    close.className = `${POPUP_CLASS}-close`;
    close.setAttribute("aria-label", "Close");
    close.title = "Close";
    close.textContent = "×";
    close.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.close();
    });
    header.append(close);

    const body = part("body");
    if (explanation.rows) {
      for (const { label, amount, total } of explanation.rows) {
        const row = part("row");
        if (total) row.classList.add(`${POPUP_CLASS}-total`);
        row.setAttribute("role", "row");
        const cells = [part("label", label), part("amount", amount)];
        for (const cell of cells) cell.setAttribute("role", "cell");
        row.append(...cells);
        body.append(row);
      }
      body.setAttribute("role", "table");
      body.setAttribute("aria-label", `Price breakdown of ${source}`);
    } else {
      body.append(part("message", explanation.message));
    }

    element.replaceChildren(header, body);
  }
}

/**
 * Set a style property only when it differs (no write, no mutation). As
 * `!important`: content.css resets everything of the pop-up with
 * `all: initial !important`, which would otherwise beat the inline position
 * and leave the pop-up at the end of the body, out of sight.
 */
function setStyle(element: HTMLElement, name: "top" | "left", value: string): void {
  const { style } = element;
  if (style.getPropertyValue(name) === value && style.getPropertyPriority(name) === "important") {
    return;
  }
  style.setProperty(name, value, "important");
}
