/**
 * What a bidder effectively pays for a given auction price. Kept in its own
 * module (and passed around as a function) so the calculation can later be
 * swapped per platform.
 */

/**
 * Effective price for `amount` under the user's settings, in the currency of
 * `settings.currency`: converted first, then the auction premium, then the
 * shipment (which is entered in that currency).
 * @param {number} amount price as read from the page
 * @param {string | undefined} currency currency `amount` is in, as read from the page
 * @param {import("./settings.js").Settings} settings
 * @param {import("./exchange-rates.js").ConversionRates} rates into `settings.currency`
 * @returns {number | undefined} undefined when `currency` is unknown or has no rate
 */
export function calculateEffectivePrice(amount, currency, settings, rates) {
  const rate = currency === undefined ? undefined : rates?.[currency];
  if (!Number.isFinite(rate)) return undefined;
  return amount * rate * (1 + settings.auctionPremium / 100) + settings.shipment;
}
