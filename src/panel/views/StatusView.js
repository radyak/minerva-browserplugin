/** Text for an ID the URL does not reveal. */
const UNKNOWN_ID = "unknown";

/**
 * The top of the "Plugin status" card: the badge saying what the extension
 * does in the active tab and, while active, the auction house and auction the
 * page is about.
 */
export class StatusView {
  /**
   * @param {object} elements
   * @param {HTMLElement} elements.badge
   * @param {HTMLElement} elements.ids the block holding house and auction, hidden while inactive
   * @param {HTMLElement} elements.house
   * @param {HTMLElement} elements.auction
   */
  constructor({ badge, ids, house, auction }) {
    this.badge = badge;
    this.ids = ids;
    this.house = house;
    this.auction = auction;
  }

  /** @param {import("../../core/state/TabState.js").TabState} state */
  render({ active, annotated, unparsable, house, auction }) {
    const label = `${annotated} price${annotated === 1 ? "" : "s"} updated`;
    this.badge.textContent = active
      ? unparsable
        ? `${label}, ${unparsable} n/a`
        : label
      : "inactive";
    this.badge.className = `badge ${active ? "text-bg-danger" : "text-bg-secondary"}`;

    this.ids.hidden = !active;
    this.house.textContent = house ?? UNKNOWN_ID;
    this.auction.textContent = auction ?? UNKNOWN_ID;
  }
}
