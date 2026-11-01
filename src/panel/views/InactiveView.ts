import { TabState } from "../../core/state/TabState.ts";

/** Below Minerva while the extension is inactive in the active tab. */
const INACTIVE_TEXT = "No auction or platform active";

/** Below Minerva while the tab is on a site, but its URL names no auction house or auction. */
const NO_AUCTION_TEXT = "No auction detected on this page";

/**
 * Switches the panel between the settings form (the active tab is on an
 * auction, see `TabState.onAuction()`) and Minerva saying "?" (otherwise). The
 * "Plugin status" card stays visible either way.
 */
export class InactiveView {
  form: HTMLElement;
  notice: HTMLElement;
  text: HTMLElement;
  /**
   * @param elements.form the settings form
   * @param elements.notice what is shown instead of it while not on an auction
   * @param elements.text the line below Minerva in `notice`
   */
  constructor({
    form,
    notice,
    text,
  }: {
    form: HTMLElement;
    notice: HTMLElement;
    text: HTMLElement;
  }) {
    this.form = form;
    this.notice = notice;
    this.text = text;
  }

  render(state: TabState) {
    this.form.hidden = !TabState.onAuction(state);
    this.notice.hidden = TabState.onAuction(state);
    this.text.textContent = state.active ? NO_AUCTION_TEXT : INACTIVE_TEXT;
  }
}
