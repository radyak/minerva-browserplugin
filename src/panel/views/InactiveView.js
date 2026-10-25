/** Below Minerva while the extension is inactive in the active tab. */
const INACTIVE_TEXT = "No auction or platform active";

/** Below Minerva while the tab is on a site, but its URL names no auction house or auction. */
const NO_AUCTION_TEXT = "No auction detected on this page";

/**
 * Switches the panel between the settings form (the active tab is on an
 * auction, see `TabState#onAuction`) and Minerva saying "?" (otherwise). The
 * "Plugin status" card stays visible either way.
 */
export class InactiveView {
  /**
   * @param {object} elements
   * @param {HTMLElement} elements.form the settings form
   * @param {HTMLElement} elements.notice what is shown instead of it while not on an auction
   * @param {HTMLElement} elements.text the line below Minerva in `notice`
   */
  constructor({ form, notice, text }) {
    this.form = form;
    this.notice = notice;
    this.text = text;
  }

  /** @param {import("../../core/state/TabState.js").TabState} state */
  render(state) {
    this.form.hidden = !state.onAuction;
    this.notice.hidden = state.onAuction;
    this.text.textContent = state.active ? NO_AUCTION_TEXT : INACTIVE_TEXT;
  }
}
