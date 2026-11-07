import { formatPrice, parsePrice, type ParsedPrice } from "../price.ts";
import type { ExchangeRates } from "../rates/ExchangeRates.ts";
import type { Settings } from "../settings/Settings.ts";
import type { AuctionSite } from "../sites/sites.ts";
import { effectivePrice, priceBreakdown } from "./PriceCalculator.ts";

/** One line of an explanation: what is added and how much; totals are set off. */
export type ExplanationRow = {
  readonly label: string;
  readonly amount: string;
  readonly total?: boolean;
};

/** How one price of the page adds up: its rows, or why there are none. */
export type Explanation =
  | { readonly rows: readonly ExplanationRow[]; readonly message?: undefined }
  | { readonly rows?: undefined; readonly message: string };

/**
 * How the price in `text` adds up to the effective price on `site`, part by
 * part, as `priceBreakdown()` works it out; amounts are written the way the
 * page writes the price, parts that are 0 are left out. A site with a
 * calculator of its own only gets the hammer and the effective price - its
 * parts are not known.
 * @param rates with `settings.currency` as base
 */
export function explainPrice(
  text: string,
  site: AuctionSite,
  settings: Settings,
  rates: ExchangeRates,
): Explanation {
  const parsed = parsePrice(text);
  if (parsed === null) return { message: "No price could be read here." };
  const code = parsed.currency?.code;
  if (code === undefined) return { message: "The currency of this price is not known." };
  const price = bare(parsed);
  /** A percentage, count or rate, with up to 4 decimals and the page's decimal separator. */
  const number = (value: number) =>
    String(Math.round(value * 10_000) / 10_000).replace(".", price.decimalSeparator);
  const money = (amount: number, currency: string) =>
    formatPrice(amount, price, currency === code ? undefined : currency);
  const noRate = { message: `No exchange rate from ${code} into ${settings.currency}.` };

  if (site.calculator !== effectivePrice) {
    const total = site.calculator(price.amount, code, settings, rates);
    if (total === undefined || !Number.isFinite(total)) return noRate;
    return {
      rows: [
        { label: "Hammer price", amount: money(price.amount, code) },
        { label: "= Effective price", amount: money(total, settings.currency), total: true },
      ],
    };
  }

  const parts = priceBreakdown(price.amount, code, settings, rates);
  if (!parts) return noRate;
  const { auction: a, buyer: b } = parts;
  const lots = settings.lotsWon === 1 ? "" : ` ÷ ${settings.lotsWon} lots`;
  const rows: ExplanationRow[] = [];
  const add = (label: string, amount: number, currency: string) => {
    if (amount !== 0) rows.push({ label: `+ ${label}`, amount: money(amount, currency) });
  };
  rows.push({ label: "Hammer price", amount: money(a.hammer, a.currency) });
  add(`Premium ${number(settings.auctionPremium)} %`, a.premium, a.currency);
  add(`VAT ${number(settings.hammerVat)} % on the hammer price`, a.hammerVat, a.currency);
  add(`Shipment ${number(settings.shipment)}${lots}`, a.shipment, a.currency);
  if (a.currency !== b.currency) {
    rows.push({ label: "= Invoice share", amount: money(a.lot, a.currency), total: true });
    rows.push({
      label: `= In ${b.currency} (1 ${a.currency} = ${number(b.lot / a.lot)} ${b.currency})`,
      amount: money(b.lot, b.currency),
    });
  }
  add(`Payment costs ${number(settings.paymentCosts)} %`, b.payment, b.currency);
  add(`Import VAT ${number(settings.importVat)} %`, b.importVat, b.currency);
  add(`Flat fees ${number(settings.flatFees)}${lots}`, b.flatFees, b.currency);
  rows.push({ label: "= Effective price", amount: money(b.total, b.currency), total: true });
  return { rows };
}

/**
 * `price` without the text around it ("Current bid: 1.000 EUR" -> "1.000 EUR"),
 * so the amounts of an explanation only carry the page's notation.
 */
function bare(price: ParsedPrice): ParsedPrice {
  const currency = price.currency;
  if (!currency) return { ...price, prefix: "", suffix: "" };
  return currency.side === "prefix"
    ? {
        ...price,
        prefix: price.prefix.slice(currency.index),
        suffix: "",
        currency: { ...currency, index: 0 },
      }
    : {
        ...price,
        prefix: "",
        suffix: price.suffix.slice(0, currency.index + currency.token.length),
      };
}
