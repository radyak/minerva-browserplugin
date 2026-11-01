import type { ExchangeRates } from "../rates/ExchangeRates.ts";
import type { Settings } from "../settings/Settings.ts";

/**
 * How the price shown next to an auction price is worked out. Every
 * AuctionSite has one (`calculator`); a site whose fees work differently
 * passes a function of its own.
 * @param amount price as read from the page
 * @param currency currency `amount` is in, as read from the page
 * @param rates with `settings.currency` as base
 * @returns the price in `settings.currency`; undefined when there is no result (shown as "n/a")
 */
export type PriceCalculator = (
  amount: number,
  currency: string | undefined,
  settings: Settings,
  rates: ExchangeRates | undefined,
) => number | undefined;

/**
 * What a bidder effectively pays: the auction premium on top of the price,
 * plus the shipment (entered in the auction's currency, like the price), all
 * converted into the user's currency. The calculation of every site that does
 * not configure another one.
 */
export const effectivePrice: PriceCalculator = (amount, currency, settings, rates) =>
  rates?.convert(amount * (1 + settings.auctionPremium / 100) + settings.shipment, currency);
