import type { ExchangeRates } from "../rates/ExchangeRates.ts";
import { BuyerCosts } from "../settings/BuyerCosts.ts";
import type { Settings } from "../settings/Settings.ts";

/**
 * How the price shown next to an auction price is worked out. Every
 * AuctionSite has one (`calculator`); a site whose fees work differently
 * passes a function of its own.
 * @param amount price as read from the page (the hammer price)
 * @param currency currency `amount` is in, as read from the page
 * @param settings of the auction
 * @param rates with `settings.currency` as base
 * @param buyer the buyer's own costs; none when omitted
 * @returns the price in `settings.currency`; undefined when there is no result (shown as "n/a")
 */
export type PriceCalculator = (
  amount: number,
  currency: string | undefined,
  settings: Settings,
  rates: ExchangeRates | undefined,
  buyer?: BuyerCosts,
) => number | undefined;

/** How `effectivePrice` arrives at its result, part by part. */
export type PriceBreakdown = {
  /** In the auction's currency (the one read from the page). */
  auction: {
    currency: string;
    hammer: number;
    premium: number;
    hammerVat: number;
    /** the lot's share of the shipment */
    shipment: number;
    /** what the auction house charges for the lot */
    lot: number;
  };
  /** In the buyer's currency (`settings.currency`). */
  buyer: {
    currency: string;
    /** `auction.lot`, converted */
    lot: number;
    payment: number;
    importVat: number;
    /** the lot's share of the flat fees */
    flatFees: number;
    total: number;
  };
};

/**
 * The parts of what a bidder effectively pays for a lot hammered at `amount`:
 *
 * ```
 * lot    = hammer × (1 + premium% + hammerVat%) + shipment / lotsWon      (auction currency)
 * total  = convert(lot) × (1 + payment% + importVat%) + flatFees / lotsWon  (buyer's currency)
 * ```
 *
 * The premium is the effective one, its VAT included, so the hammer VAT only
 * applies to the hammer price. Payment costs and import VAT are both charged
 * on the converted lot, but separately (customs do not take the bank's markup),
 * hence added, not multiplied.
 * @returns undefined without a currency or a rate for it
 */
export function priceBreakdown(
  amount: number,
  currency: string | undefined,
  settings: Settings,
  rates: ExchangeRates | undefined,
  buyer: BuyerCosts = BuyerCosts.DEFAULT,
): PriceBreakdown | undefined {
  const premium = (amount * settings.auctionPremium) / 100;
  const hammerVat = (amount * settings.hammerVat) / 100;
  const shipment = settings.shipment / settings.lotsWon;
  const lot = amount + premium + hammerVat + shipment;
  const converted = rates?.convert(lot, currency);
  if (currency === undefined || converted === undefined || !Number.isFinite(converted)) {
    return undefined;
  }
  const costs = buyer.applied;
  const payment = (converted * costs.paymentCosts) / 100;
  const importVat = (converted * costs.importVat) / 100;
  const flatFees = costs.flatFees / settings.lotsWon;
  return {
    auction: { currency, hammer: amount, premium, hammerVat, shipment, lot },
    buyer: {
      currency: settings.currency,
      lot: converted,
      payment,
      importVat,
      flatFees,
      total: converted + payment + importVat + flatFees,
    },
  };
}

/**
 * What a bidder effectively pays, in the user's currency (see
 * `priceBreakdown`). The calculation of every site that does not configure
 * another one.
 */
export const effectivePrice: PriceCalculator = (amount, currency, settings, rates, buyer) =>
  priceBreakdown(amount, currency, settings, rates, buyer)?.buyer.total;
