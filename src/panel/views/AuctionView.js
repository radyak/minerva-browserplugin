/** Text for an ID the URL does not reveal. */
const UNKNOWN_ID = "unknown";

/**
 * The top of the panel: the auction house and auction the active tab is on,
 * as read from its URL. Shown together with the settings form, i.e. only while
 * the tab is on an auction (`TabState#onAuction`).
 */
export class AuctionView {
  /**
   * @param {object} elements
   * @param {HTMLElement} elements.ids the block holding house and auction
   * @param {HTMLElement} elements.house
   * @param {HTMLElement} elements.auction
   */
  constructor({ ids, house, auction }) {
    this.ids = ids;
    this.house = house;
    this.auction = auction;
  }

  /** @param {import("../../core/state/TabState.js").TabState} state */
  render(state) {
    this.ids.hidden = !state.onAuction;
    this.house.textContent = state.house ?? UNKNOWN_ID;
    this.auction.textContent = state.auction ?? UNKNOWN_ID;
  }
}
