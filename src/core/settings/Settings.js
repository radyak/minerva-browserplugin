import { Currency } from "../currency/Currency.js";

/**
 * The user settings entered in the side panel and read by the content script.
 * Knows the accepted ranges and how to turn stored data into settings the
 * calculation can rely on; where they are stored is SettingsStore's business
 * (src/browser/SettingsStore.js). Immutable.
 */
export class Settings {
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
   * Settings out of stored data (see `toJSON()`), falling back to `DEFAULT` for
   * anything missing, non-numeric, out of range or not a supported currency.
   * @param {unknown} data
   * @returns {Settings}
   */
  static from(data) {
    const { RANGES, DEFAULT } = Settings;
    const values = /** @type {Record<string, unknown> | null | undefined} */ (data);
    /** @param {"auctionPremium" | "shipment"} name */
    const number = (name) => {
      const raw = values?.[name];
      const value = raw === null || raw === "" ? NaN : Number(raw);
      const { min, max } = RANGES[name];
      return Number.isFinite(value) && value >= min && value <= max ? value : DEFAULT[name];
    };
    return new Settings({
      auctionPremium: number("auctionPremium"),
      shipment: number("shipment"),
      currency: Currency.of(values?.currency)?.code ?? DEFAULT.currency,
    });
  }

  /** @returns {{auctionPremium: number, shipment: number, currency: string}} plain data to store */
  toJSON() {
    return {
      auctionPremium: this.auctionPremium,
      shipment: this.shipment,
      currency: this.currency,
    };
  }
}
