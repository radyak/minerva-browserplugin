import type { ExchangeRates } from "../rates/ExchangeRates.ts";
import type { Settings } from "../settings/Settings.ts";

/**
 * How the price shown next to an auction price is worked out. Every
 * AuctionSite has one (`AuctionSite.calculator`); sites whose fees work
 * differently get a subclass of their own.
 */
export class PriceCalculator {
  /**
   * The price to show for `amount`, in `settings.currency`. Subclasses override it.
   * @param amount price as read from the page
   * @param currency currency `amount` is in, as read from the page
   * @param rates with `settings.currency` as base
   * @returns undefined when there is no result (shown as "n/a")
   */
  /* eslint-disable @typescript-eslint/no-unused-vars -- the signature subclasses implement */
  calculate(
    amount: number,
    currency: string | undefined,
    settings: Settings,
    rates: ExchangeRates | undefined,
  ): number | undefined {
    throw new Error(`${this.constructor.name} does not implement calculate()`);
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */
}
