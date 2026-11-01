import { priceBreakdown } from "../core/pricing/PriceCalculator.ts";
import { ExchangeRates } from "../core/rates/ExchangeRates.ts";
import type { BuyerCosts } from "../core/settings/BuyerCosts.ts";
import type { Settings } from "../core/settings/Settings.ts";

/** The hammer price of the example. */
const EXAMPLE_AMOUNT = 1000;

const money = (amount: number, currency: string) =>
  `${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 4 });

type Row = { label: string; amount: string; total?: boolean };

/**
 * A collapsible example of how a price of the page adds up with the entered
 * values (saved or not): a hammer price of 1,000 in the page's currency, part
 * by part, as `effectivePrice` works it out. Parts that are 0 are left out.
 * @param props.currency of the example's hammer price: the page's
 * @param props.rates into `settings.currency`; undefined while loading, null when unavailable
 */
export function PriceBreakdownView({
  settings,
  buyer,
  currency,
  rates,
}: {
  settings: Settings;
  buyer: BuyerCosts;
  currency: string;
  rates: ExchangeRates | null | undefined;
}) {
  // Without rates, a page in the picked currency still needs none.
  const usable = rates ?? ExchangeRates.empty(settings.currency);
  const parts = priceBreakdown(EXAMPLE_AMOUNT, currency, settings, usable, buyer);
  const lots = settings.lotsWon === 1 ? "" : ` ÷ ${settings.lotsWon} lots`;
  const rows: Row[] = [];
  if (parts) {
    const { auction: a, buyer: b } = parts;
    const add = (label: string, amount: number, code: string) => {
      if (amount !== 0) rows.push({ label: `+ ${label}`, amount: money(amount, code) });
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
    const applied = buyer.applied;
    add(`Payment costs ${number(applied.paymentCosts)} %`, b.payment, b.currency);
    add(`Import VAT ${number(applied.importVat)} %`, b.importVat, b.currency);
    add(`Flat fees ${number(applied.flatFees)}${lots}`, b.flatFees, b.currency);
    rows.push({ label: "= Effective price", amount: money(b.total, b.currency), total: true });
  }
  return (
    <details className="price-breakdown small">
      <summary>How a price adds up</summary>
      {parts ? (
        <table className="table table-sm small mb-0 mt-1" aria-label="Price breakdown">
          <tbody>
            {rows.map(({ label, amount, total }) => (
              <tr key={label} className={total ? "fw-semibold" : undefined}>
                <td>{label}</td>
                <td className="text-end text-nowrap">{amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="form-text mt-1">
          {rates === undefined ? "Loading…" : `No exchange rate for ${currency}.`}
        </div>
      )}
    </details>
  );
}
