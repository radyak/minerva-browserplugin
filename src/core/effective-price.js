/**
 * What a bidder effectively pays for a given auction price. Kept in its own
 * module (and passed around as a function) so the calculation can later be
 * swapped per platform.
 */

/**
 * Effective price for `amount` under the user's settings.
 * @param {number} amount price as read from the page
 * @param {import("./settings.js").Settings} settings
 * @returns {number}
 */
export function calculateEffectivePrice(amount, settings) {
  return amount * (1 + settings.auctionPremium / 100) + settings.shipment;
}
