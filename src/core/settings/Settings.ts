import { UserCurrency } from "../currency/UserCurrency.ts";
import { inRange, type Range } from "./ranges.ts";

/** `Settings#toJSON()`. */
export type SettingsJSON = {
  auctionPremium: number;
  shipment: number;
  lotsWon: number;
  hammerVat: number;
  importVat: number;
  paymentCosts: number;
  flatFees: number;
  currency: string;
};

/**
 * `Settings#perAuction()`: what is saved per auction - everything but the
 * currency, which is the user's own and the same for every auction.
 */
export type AuctionSettingsJSON = Omit<SettingsJSON, "currency">;

/** The numeric settings, each with its accepted range. */
export type NumericSetting =
  | "auctionPremium"
  | "shipment"
  | "lotsWon"
  | "hammerVat"
  | "importVat"
  | "paymentCosts"
  | "flatFees";

/**
 * What the calculation of one auction's prices needs: every cost factor, from
 * the premium to the payment costs - saved per auction, since they all differ
 * between sites, houses and the countries lots ship from - and the user's
 * currency, which is global (SettingsBook applies it to every auction).
 * Entered in the side panel and read by the content script.
 * Knows the accepted ranges and how to turn stored data into
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
    importVat: Object.freeze({ min: 0, max: 100 }),
    paymentCosts: Object.freeze({ min: 0, max: 100 }),
    flatFees: Object.freeze({ min: 0, max: Infinity }),
  });
  readonly currency: string;
  readonly auctionPremium: number;
  readonly shipment: number;
  readonly lotsWon: number;
  readonly hammerVat: number;
  readonly importVat: number;
  readonly paymentCosts: number;
  readonly flatFees: number;

  /**
   * @param values.auctionPremium the *effective* buyer's premium in percent, on
   *   the hammer price: including the VAT on the premium and any online or live
   *   bidding surcharge
   * @param values.shipment flat shipping cost per invoice, in the currency of
   *   the auction's prices, not in `currency`
   * @param values.lotsWon how many lots the bidder expects to win in this
   *   auction; the shipment and the flat fees are split over them
   * @param values.hammerVat VAT on the hammer price in percent, for regularly
   *   taxed or imported lots; 0 for none (margin scheme)
   * @param values.importVat import VAT in percent, on the converted lot: for
   *   lots shipped in from outside the buyer's customs area
   * @param values.paymentCosts in percent of the converted lot: the exchange
   *   rate markup of bank or card plus any surcharge for the payment method
   * @param values.flatFees flat fees per invoice in `currency`: customs
   *   clearance, bank transfer
   * @param values.currency the user's currency: an ISO code (see UserCurrency)
   * All numbers within `RANGES`.
   */
  constructor({
    auctionPremium,
    shipment,
    lotsWon = 1,
    hammerVat = 0,
    importVat = 0,
    paymentCosts = 0,
    flatFees = 0,
    currency,
  }: {
    auctionPremium: number;
    shipment: number;
    lotsWon?: number;
    hammerVat?: number;
    importVat?: number;
    paymentCosts?: number;
    flatFees?: number;
    currency: string;
  }) {
    this.auctionPremium = auctionPremium;
    this.shipment = shipment;
    this.lotsWon = lotsWon;
    this.hammerVat = hammerVat;
    this.importVat = importVat;
    this.paymentCosts = paymentCosts;
    this.flatFees = flatFees;
    this.currency = currency;
    Object.freeze(this);
  }

  /** Used for every setting that is unset or out of range. */
  static DEFAULT = new Settings({
    auctionPremium: 0,
    shipment: 0,
    lotsWon: 1,
    hammerVat: 0,
    importVat: 0,
    paymentCosts: 0,
    flatFees: 0,
    currency: UserCurrency.DEFAULT,
  });

  /**
   * Settings out of stored data (see `toJSON()`), falling back to `DEFAULT` for
   * anything missing, non-numeric, out of range or not a currency code.
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
      importVat: number("importVat"),
      paymentCosts: number("paymentCosts"),
      flatFees: number("flatFees"),
      currency: UserCurrency.orDefault(values?.currency),
    });
  }

  /**
   * These settings in `currency`; the same object when they already are.
   * Falls back to the default currency for an invalid one, as `from()`.
   */
  withCurrency(currency: string): Settings {
    return currency === this.currency ? this : Settings.from({ ...this.toJSON(), currency });
  }

  /** Plain data, with the currency. */
  toJSON(): SettingsJSON {
    return { ...this.perAuction(), currency: this.currency };
  }

  /** Plain data to store per auction: without the currency, which is global. */
  perAuction(): AuctionSettingsJSON {
    return {
      auctionPremium: this.auctionPremium,
      shipment: this.shipment,
      lotsWon: this.lotsWon,
      hammerVat: this.hammerVat,
      importVat: this.importVat,
      paymentCosts: this.paymentCosts,
      flatFees: this.flatFees,
    };
  }
}
