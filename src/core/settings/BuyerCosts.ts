import { inRange, type Range } from "./ranges.ts";

/** `BuyerCosts#toJSON()`. */
export type BuyerCostsJSON = {
  enabled: boolean;
  importVat: number;
  paymentCosts: number;
  flatFees: number;
};

/** The numeric buyer costs, each with its accepted range. */
export type NumericBuyerCost = "importVat" | "paymentCosts" | "flatFees";

/**
 * The buyer's own costs, the same for every auction: what arrives on top of
 * the auction's invoice. Saved once (not per auction like Settings), entered in
 * the side panel's "Your costs" section and switched on or off as a whole -
 * the amounts are kept while switched off. Immutable.
 */
export class BuyerCosts {
  /** Accepted range per numeric cost; the panel inputs use it for `min`/`max`. */
  static RANGES: Readonly<Record<NumericBuyerCost, Range>> = Object.freeze({
    importVat: Object.freeze({ min: 0, max: 100 }),
    paymentCosts: Object.freeze({ min: 0, max: 100 }),
    flatFees: Object.freeze({ min: 0, max: Infinity }),
  });
  /** whether the costs are added at all */
  readonly enabled: boolean;
  readonly importVat: number;
  readonly paymentCosts: number;
  readonly flatFees: number;

  /**
   * @param values.importVat import VAT in percent, on the lot's value
   * @param values.paymentCosts in percent of the lot's value: the exchange
   *   rate markup of bank or card plus any surcharge for the payment method
   * @param values.flatFees flat fees per invoice in the buyer's currency (the
   *   one selected in the panel): customs clearance, bank transfer
   * All numbers within `RANGES`.
   */
  constructor({
    enabled,
    importVat,
    paymentCosts,
    flatFees,
  }: {
    enabled: boolean;
    importVat: number;
    paymentCosts: number;
    flatFees: number;
  }) {
    this.enabled = enabled;
    this.importVat = importVat;
    this.paymentCosts = paymentCosts;
    this.flatFees = flatFees;
    Object.freeze(this);
  }

  /** Nothing entered yet, switched off; used for every value that is unset or out of range. */
  static DEFAULT = new BuyerCosts({ enabled: false, importVat: 0, paymentCosts: 0, flatFees: 0 });

  /** The costs that apply: these, or none at all while switched off. */
  get applied(): { importVat: number; paymentCosts: number; flatFees: number } {
    return this.enabled ? this : { importVat: 0, paymentCosts: 0, flatFees: 0 };
  }

  /**
   * Buyer costs out of stored data (see `toJSON()`), falling back to `DEFAULT`
   * for anything missing, non-numeric or out of range.
   */
  static from(data: unknown): BuyerCosts {
    const { RANGES, DEFAULT } = BuyerCosts;
    const values = data as Record<string, unknown> | null | undefined;
    const number = (name: NumericBuyerCost) => inRange(values?.[name], RANGES[name], DEFAULT[name]);
    return new BuyerCosts({
      enabled: values?.enabled === true,
      importVat: number("importVat"),
      paymentCosts: number("paymentCosts"),
      flatFees: number("flatFees"),
    });
  }

  /** Plain data to store. */
  toJSON(): BuyerCostsJSON {
    return {
      enabled: this.enabled,
      importVat: this.importVat,
      paymentCosts: this.paymentCosts,
      flatFees: this.flatFees,
    };
  }
}
