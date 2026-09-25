/**
 * User settings entered in the side panel and read by the content script.
 * Both sides go through browser.storage.local, this module only knows the keys
 * and how to turn stored values into values the calculation can rely on.
 */

/** Currencies the user can pick from; the first one is the default. */
export const CURRENCIES = Object.freeze(["EUR", "USD", "GBP", "CHF"]);

/**
 * @typedef {object} Settings
 * @property {number} auctionPremium Buyer's premium in percent (0-100).
 * @property {number} shipment Flat shipping cost per item in `currency` (>= 0).
 * @property {string} currency One of CURRENCIES.
 */

/** browser.storage.local key of every setting. */
export const SETTINGS_STORAGE_KEYS = Object.freeze({
  auctionPremium: "settings.auctionPremium",
  shipment: "settings.shipment",
  currency: "settings.currency",
});

/** Used for every setting that is unset or out of range. @type {Settings} */
export const DEFAULT_SETTINGS = Object.freeze({
  auctionPremium: 0,
  shipment: 0,
  currency: CURRENCIES[0],
});

/** Accepted range per numeric setting, mirroring the panel inputs. */
const RANGES = { auctionPremium: [0, 100], shipment: [0, Infinity] };

/**
 * Build the settings out of a browser.storage.local result, falling back to
 * DEFAULT_SETTINGS for anything missing, non-numeric or out of range.
 * @param {Record<string, unknown> | undefined} stored
 * @returns {Settings}
 */
export function readSettings(stored) {
  const settings = { ...DEFAULT_SETTINGS };
  for (const [name, [min, max]] of Object.entries(RANGES)) {
    const raw = stored?.[SETTINGS_STORAGE_KEYS[name]];
    const value = raw === null || raw === "" ? NaN : Number(raw);
    if (Number.isFinite(value) && value >= min && value <= max) settings[name] = value;
  }
  const currency = stored?.[SETTINGS_STORAGE_KEYS.currency];
  if (CURRENCIES.includes(currency)) settings.currency = currency;
  return settings;
}
