/** The badge in the "Plugin status" card: what the extension does in the active tab. */
export class StatusView {
  /** @param {HTMLElement} element */
  constructor(element) {
    this.element = element;
  }

  /** @param {import("../../core/state/TabState.js").TabState} state */
  render({ active, annotated, unparsable }) {
    const label = `${annotated} price${annotated === 1 ? "" : "s"} updated`;
    this.element.textContent = active
      ? unparsable
        ? `${label}, ${unparsable} n/a`
        : label
      : "inactive";
    this.element.className = `badge ${active ? "text-bg-danger" : "text-bg-secondary"}`;
  }
}
