import { PriceCalculator } from "./PriceCalculator.ts";
import type { ExchangeRates } from "../rates/ExchangeRates.ts";
import type { Settings } from "../settings/Settings.ts";

/**
 * What a bidder effectively pays for an auction price: the auction premium on
 * top of the price, plus the shipment (which is entered in the auction's
 * currency, like the price), all converted into the user's currency. The
 * calculation every site uses unless it configures another one.
 */
export class EffectivePriceCalculator extends PriceCalculator {
  /**
   * @param amount price as read from the page
   * @param currency currency `amount` and the shipment are in, as read
   *   from the page
   * @param rates with `settings.currency` as base
   * @returns undefined when `currency` is unknown or has no rate
   */
  override calculate(
    amount: number,
    currency: string | undefined,
    settings: Settings,
    rates: ExchangeRates | undefined,
  ): number | undefined {
    return rates?.convert(
      amount * (1 + settings.auctionPremium / 100) + settings.shipment,
      currency,
    );
  }
}
