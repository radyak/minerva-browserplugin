import { Currency } from "../currency/Currency.ts";

/** `Settings#toJSON()`. */
export type SettingsJSON = { auctionPremium: number; shipment: number; currency: string };

/**
 * The user settings entered in the side panel and read by the content script.
 * Knows the accepted ranges and how to turn stored data into settings the
 * calculation can rely on; where they are stored is SettingsStore's business
 * (src/browser/SettingsStore.ts). Immutable.
 */
export class Settings {
  /** Accepted range per numeric setting; the panel inputs use it for `min`/`max`. */
  static RANGES = Object.freeze({
    auctionPremium: Object.freeze({ min: 0, max: 100 }),
    shipment: Object.freeze({ min: 0, max: Infinity }),
  });
  readonly currency: string;
  readonly auctionPremium: number;
  readonly shipment: number;

  /**
   * @param values.auctionPremium Buyer's premium in percent, within `RANGES`.
   * @param values.shipment Flat shipping cost per item, within `RANGES`; in
   *   the currency of the auction's prices, not in `currency`.
   * @param values.currency ISO code, one of `Currency.CODES`.
   */
  constructor({
    auctionPremium,
    shipment,
    currency,
  }: {
    auctionPremium: number;
    shipment: number;
    currency: string;
  }) {
    this.auctionPremium = auctionPremium;
    this.shipment = shipment;
    this.currency = currency;
    Object.freeze(this);
  }

  /** Used for every setting that is unset or out of range. */
  static DEFAULT = new Settings({ auctionPremium: 0, shipment: 0, currency: Currency.CODES[0]! });

  /**
   * Settings out of stored data (see `toJSON()`), falling back to `DEFAULT` for
   * anything missing, non-numeric, out of range or not a supported currency.
   */
  static from(data: unknown): Settings {
    const { RANGES, DEFAULT } = Settings;
    const values = data as Record<string, unknown> | null | undefined;
    const number = (name: "auctionPremium" | "shipment") => {
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

  /** Plain data to store. */
  toJSON(): SettingsJSON {
    return {
      auctionPremium: this.auctionPremium,
      shipment: this.shipment,
      currency: this.currency,
    };
  }
}
