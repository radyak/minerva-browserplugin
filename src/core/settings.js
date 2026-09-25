/**
 * User settings entered in the side panel and read by the content script.
 * Both sides go through browser.storage.local, this module only knows the keys
 * and how to turn stored values into numbers the calculation can rely on.
 */

/**
 * @typedef {object} Settings
 * @property {number} auctionPremium Buyer's premium in percent (0-100).
 * @property {number} shipment Flat shipping cost per item in EUR (>= 0).
 */

/** browser.storage.local key of every setting. */
export const SETTINGS_STORAGE_KEYS = Object.freeze({
  auctionPremium: "settings.auctionPremium",
  shipment: "settings.shipment",
});

/** Used for every setting that is unset or out of range. @type {Settings} */
export const DEFAULT_SETTINGS = Object.freeze({ auctionPremium: 0, shipment: 0 });

/** Accepted range per setting, mirroring the panel inputs. */
const RANGES = { auctionPremium: [0, 100], shipment: [0, Infinity] };

/**
 * Build the settings out of a browser.storage.local result, falling back to
 * DEFAULT_SETTINGS for anything missing, non-numeric or out of range.
 * @param {Record<string, unknown> | undefined} stored
 * @returns {Settings}
 */
export function readSettings(stored) {
  const settings = { ...DEFAULT_SETTINGS };
  for (const [name, key] of Object.entries(SETTINGS_STORAGE_KEYS)) {
    const raw = stored?.[key];
    const value = raw === null || raw === "" ? NaN : Number(raw);
    const [min, max] = RANGES[name];
    if (Number.isFinite(value) && value >= min && value <= max) settings[name] = value;
  }
  return settings;
}
