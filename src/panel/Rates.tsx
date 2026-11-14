import type { ExchangeRates } from "../core/rates/ExchangeRates.ts";

/**
 * What one unit of each page currency is worth in `rates.base`, shown under the
 * currency select: only the rates the page needs, from the currencies of its
 * prices into the selected one.
 * @param props.rates of the selected currency; undefined while loading, null when unavailable
 * @param props.currencies currency codes of the prices in the active tab
 */
export function Rates({
  rates,
  currencies,
}: {
  rates: ExchangeRates | null | undefined;
  currencies: readonly string[];
}) {
  const foreign = rates ? currencies.filter((code) => code !== rates.base) : [];
  const info =
    rates === undefined
      ? "Loading…"
      : rates === null
        ? "Exchange rates unavailable."
        : foreign.length
          ? `ECB reference rate of ${rates.date}`
          : currencies.length
            ? `Prices on this page are in ${rates.base}.`
            : "No prices on this page.";
  return (
    <section className="mt-1" aria-label="Exchange rates">
      <table className="table table-sm small mb-0">
        <tbody>
          {rates &&
            foreign.map((code) => {
              const factor = rates.factorFrom(code);
              return (
                <tr key={code}>
                  <td>1 {code} =</td>
                  <td className="text-end">
                    {factor === undefined
                      ? "n/a"
                      : `${factor.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${rates.base}`}
                  </td>
                </tr>
              );
            })}
        </tbody>
      </table>
      <div className={`form-text mt-1 small${rates === null ? " text-danger" : ""}`}>{info}</div>
    </section>
  );
}
