/**
 * How the price shown next to an auction price is worked out. Every
 * AuctionSite has one (`AuctionSite.calculator`); sites whose fees work
 * differently get a subclass of their own.
 * @abstract
 */
export class PriceCalculator {
  /**
   * The price to show for `amount`, in `settings.currency`.
   * @abstract
   * @param {number} amount price as read from the page
   * @param {string | undefined} currency currency `amount` is in, as read from the page
   * @param {import("../settings/Settings.js").Settings} settings
   * @param {import("../rates/ExchangeRates.js").ExchangeRates | undefined} rates with
   *   `settings.currency` as base
   * @returns {number | undefined} undefined when there is no result (shown as "n/a")
   */
  // eslint-disable-next-line no-unused-vars
  calculate(amount, currency, settings, rates) {
    throw new Error(`${this.constructor.name} does not implement calculate()`);
  }
}
