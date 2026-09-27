import { Currency } from "../currency/Currency.js";

/**
 * The user settings entered in the side panel and read by the content script.
 * Both sides go through browser.storage.local; this class knows the storage
 * keys, the accepted ranges and how to turn stored values into settings the
 * calculation can rely on. Immutable.
 */
export class Settings {
  /** browser.storage.local key of every setting. */
  static STORAGE_KEYS = Object.freeze({
    auctionPremium: "settings.auctionPremium",
    shipment: "settings.shipment",
    currency: "settings.currency",
  });

  /** Accepted range per numeric setting; the panel inputs use it for `min`/`max`. */
  static RANGES = Object.freeze({
    auctionPremium: Object.freeze({ min: 0, max: 100 }),
    shipment: Object.freeze({ min: 0, max: Infinity }),
  });

  /**
   * @param {object} values
   * @param {number} values.auctionPremium Buyer's premium in percent, within `RANGES`.
   * @param {number} values.shipment Flat shipping cost per item in `currency`, within `RANGES`.
   * @param {string} values.currency ISO code, one of `Currency.CODES`.
   */
  constructor({ auctionPremium, shipment, currency }) {
    /** @readonly */
    this.auctionPremium = auctionPremium;
    /** @readonly */
    this.shipment = shipment;
    /** @readonly */
    this.currency = currency;
    Object.freeze(this);
  }

  /** Used for every setting that is unset or out of range. */
  static DEFAULT = new Settings({ auctionPremium: 0, shipment: 0, currency: Currency.CODES[0] });

  /**
   * Settings out of a browser.storage.local result, falling back to `DEFAULT`
   * for anything missing, non-numeric, out of range or not a supported currency.
   * @param {Record<string, unknown> | undefined} stored
   * @returns {Settings}
   */
  static fromStorage(stored) {
    const { STORAGE_KEYS, RANGES, DEFAULT } = Settings;
    /** @param {"auctionPremium" | "shipment"} name */
    const number = (name) => {
      const raw = stored?.[STORAGE_KEYS[name]];
      const value = raw === null || raw === "" ? NaN : Number(raw);
      const { min, max } = RANGES[name];
      return Number.isFinite(value) && value >= min && value <= max ? value : DEFAULT[name];
    };
    return new Settings({
      auctionPremium: number("auctionPremium"),
      shipment: number("shipment"),
      currency: Currency.of(stored?.[STORAGE_KEYS.currency])?.code ?? DEFAULT.currency,
    });
  }

  /** @returns {Record<string, number | string>} every setting keyed by its storage key */
  toStorage() {
    const { STORAGE_KEYS } = Settings;
    return {
      [STORAGE_KEYS.auctionPremium]: this.auctionPremium,
      [STORAGE_KEYS.shipment]: this.shipment,
      [STORAGE_KEYS.currency]: this.currency,
    };
  }
}
