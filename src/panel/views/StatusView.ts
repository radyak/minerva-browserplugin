import type { TabState } from "../../core/state/TabState.ts";

/**
 * The badge at the top of the "Plugin status" card: what the extension does
 * in the active tab.
 */
export class StatusView {
  readonly badge: HTMLElement;

  constructor(badge: HTMLElement) {
    this.badge = badge;
  }

  render({ active, annotated, unparsable }: TabState): void {
    const label = `${annotated} price${annotated === 1 ? "" : "s"} annotated`;
    this.badge.textContent = active
      ? unparsable
        ? `${label}, ${unparsable} n/a`
        : label
      : "inactive";
    this.badge.className = `badge ${active ? "text-bg-danger" : "text-bg-secondary"}`;
  }
}
