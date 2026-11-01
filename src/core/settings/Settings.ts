import { Currency } from "../currency/Currency.ts";
import { inRange, type Range } from "./ranges.ts";

/** `Settings#toJSON()`. */
export type SettingsJSON = {
  auctionPremium: number;
  shipment: number;
  lotsWon: number;
  hammerVat: number;
  currency: string;
};

/** The numeric settings, each with its accepted range. */
export type NumericSetting = "auctionPremium" | "shipment" | "lotsWon" | "hammerVat";

/**
 * The settings of one auction, entered in the side panel and read by the
 * content script (the buyer's own costs, the same for every auction, are
 * BuyerCosts). Knows the accepted ranges and how to turn stored data into
 * settings the calculation can rely on; where they are stored is
 * SettingsStore's business (src/browser/SettingsStore.ts). Immutable.
 */
export class Settings {
  /** Accepted range per numeric setting; the panel inputs use it for `min`/`max`. */
  static RANGES: Readonly<Record<NumericSetting, Range>> = Object.freeze({
    auctionPremium: Object.freeze({ min: 0, max: 100 }),
    shipment: Object.freeze({ min: 0, max: Infinity }),
    lotsWon: Object.freeze({ min: 1, max: 999, integer: true }),
    hammerVat: Object.freeze({ min: 0, max: 100 }),
  });
  readonly currency: string;
  readonly auctionPremium: number;
  readonly shipment: number;
  readonly lotsWon: number;
  readonly hammerVat: number;

  /**
   * @param values.auctionPremium the *effective* buyer's premium in percent, on
   *   the hammer price: including the VAT on the premium and any online or live
   *   bidding surcharge
   * @param values.shipment flat shipping cost per invoice, in the currency of
   *   the auction's prices, not in `currency`
   * @param values.lotsWon how many lots the bidder expects to win in this
   *   auction; the shipment (and the buyer's flat fees) are split over them
   * @param values.hammerVat VAT on the hammer price in percent, for regularly
   *   taxed or imported lots; 0 for none (margin scheme)
   * @param values.currency ISO code, one of `Currency.CODES`
   * All numbers within `RANGES`.
   */
  constructor({
    auctionPremium,
    shipment,
    lotsWon = 1,
    hammerVat = 0,
    currency,
  }: {
    auctionPremium: number;
    shipment: number;
    lotsWon?: number;
    hammerVat?: number;
    currency: string;
  }) {
    this.auctionPremium = auctionPremium;
    this.shipment = shipment;
    this.lotsWon = lotsWon;
    this.hammerVat = hammerVat;
    this.currency = currency;
    Object.freeze(this);
  }

  /** Used for every setting that is unset or out of range. */
  static DEFAULT = new Settings({
    auctionPremium: 0,
    shipment: 0,
    lotsWon: 1,
    hammerVat: 0,
    currency: Currency.CODES[0]!,
  });

  /**
   * Settings out of stored data (see `toJSON()`), falling back to `DEFAULT` for
   * anything missing, non-numeric, out of range or not a supported currency.
   * Data saved before a setting existed thus gets its default.
   */
  static from(data: unknown): Settings {
    const { RANGES, DEFAULT } = Settings;
    const values = data as Record<string, unknown> | null | undefined;
    const number = (name: NumericSetting) => inRange(values?.[name], RANGES[name], DEFAULT[name]);
    return new Settings({
      auctionPremium: number("auctionPremium"),
      shipment: number("shipment"),
      lotsWon: number("lotsWon"),
      hammerVat: number("hammerVat"),
      currency: Currency.of(values?.currency)?.code ?? DEFAULT.currency,
    });
  }

  /** Plain data to store. */
  toJSON(): SettingsJSON {
    return {
      auctionPremium: this.auctionPremium,
      shipment: this.shipment,
      lotsWon: this.lotsWon,
      hammerVat: this.hammerVat,
      currency: this.currency,
    };
  }
}
