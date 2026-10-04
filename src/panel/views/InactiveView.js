/**
 * Switches the panel between the settings form (extension active in the
 * active tab) and Minerva saying "?" (inactive). The "Plugin status" card
 * stays visible either way.
 */
export class InactiveView {
  /**
   * @param {object} elements
   * @param {HTMLElement} elements.form the settings form
   * @param {HTMLElement} elements.notice what is shown instead of it while inactive
   */
  constructor({ form, notice }) {
    this.form = form;
    this.notice = notice;
  }

  /** @param {import("../../core/state/TabState.js").TabState} state */
  render({ active }) {
    this.form.hidden = !active;
    this.notice.hidden = active;
  }
}
