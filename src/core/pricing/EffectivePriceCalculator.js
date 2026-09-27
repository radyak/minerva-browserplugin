import { PriceCalculator } from "./PriceCalculator.js";

/**
 * What a bidder effectively pays for an auction price: converted into the
 * user's currency first, then the auction premium, then the shipment (which is
 * entered in that currency). The calculation every site uses unless it
 * configures another one.
 */
export class EffectivePriceCalculator extends PriceCalculator {
  /**
   * @param {number} amount price as read from the page
   * @param {string | undefined} currency currency `amount` is in, as read from the page
   * @param {import("../settings/Settings.js").Settings} settings
   * @param {import("../rates/ExchangeRates.js").ExchangeRates | undefined} rates with
   *   `settings.currency` as base
   * @returns {number | undefined} undefined when `currency` is unknown or has no rate
   */
  calculate(amount, currency, settings, rates) {
    const converted = rates?.convert(amount, currency);
    if (converted === undefined) return undefined;
    return converted * (1 + settings.auctionPremium / 100) + settings.shipment;
  }
}
