import { PriceCalculator } from "./PriceCalculator.js";

/**
 * What a bidder effectively pays for an auction price: the auction premium on
 * top of the price, plus the shipment (which is entered in the auction's
 * currency, like the price), all converted into the user's currency. The
 * calculation every site uses unless it configures another one.
 */
export class EffectivePriceCalculator extends PriceCalculator {
  /**
   * @param {number} amount price as read from the page
   * @param {string | undefined} currency currency `amount` and the shipment are in, as read
   *   from the page
   * @param {import("../settings/Settings.js").Settings} settings
   * @param {import("../rates/ExchangeRates.js").ExchangeRates | undefined} rates with
   *   `settings.currency` as base
   * @returns {number | undefined} undefined when `currency` is unknown or has no rate
   */
  calculate(amount, currency, settings, rates) {
    return rates?.convert(
      amount * (1 + settings.auctionPremium / 100) + settings.shipment,
      currency,
    );
  }
}
