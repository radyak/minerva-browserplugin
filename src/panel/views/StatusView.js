/**
 * The badge at the top of the "Plugin status" card: what the extension does
 * in the active tab.
 */
export class StatusView {
  /** @param {HTMLElement} badge */
  constructor(badge) {
    this.badge = badge;
  }

  /** @param {import("../../core/state/TabState.js").TabState} state */
  render({ active, annotated, unparsable }) {
    const label = `${annotated} price${annotated === 1 ? "" : "s"} annotated`;
    this.badge.textContent = active
      ? unparsable
        ? `${label}, ${unparsable} n/a`
        : label
      : "inactive";
    this.badge.className = `badge ${active ? "text-bg-danger" : "text-bg-secondary"}`;
  }
}
