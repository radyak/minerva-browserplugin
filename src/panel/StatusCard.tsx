import type { ExchangeRates } from "../core/rates/ExchangeRates.ts";
import type { TabState } from "../core/state/TabState.ts";

/**
 * The "Plugin status" card at the bottom: what the extension does in the
 * active tab, and the rates the tab needs - from the currencies of its prices
 * into the selected one.
 * @param props.tab null while the active tab's state is not known yet
 * @param props.rates of the selected currency; undefined while loading, null when unavailable
 */
export function StatusCard({
  tab,
  rates,
}: {
  tab: TabState | null;
  rates: ExchangeRates | null | undefined;
}) {
  return (
    <footer className="mt-auto">
      <div className="card shadow-sm w-100">
        <div className="card-header">Plugin status</div>
        <div className="card-body d-flex flex-column gap-2">
          <div>
            <StatusBadge tab={tab} />
          </div>
          <div>
            <div className="small fw-semibold">Exchange rate</div>
            <Rates rates={rates} currencies={tab?.currencies ?? []} />
          </div>
        </div>
      </div>

      <div className="form-text mt-2 small">
        <p className="mb-1">
          Minerva is a bidding aid only. No responsibility is taken for the correctness of the
          effective prices. Report bugs or file feature requests to{" "}
          <a href="mailto:bgock@proton.me?subject=Minerva Request">this email</a> or on{" "}
          <a
            href="https://github.com/radyak/minerva-browserplugin"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          .
        </p>
      </div>
    </footer>
  );
}

function StatusBadge({ tab }: { tab: TabState | null }) {
  if (!tab) return <span className="badge text-bg-secondary">checking…</span>;
  if (!tab.active) return <span className="badge text-bg-secondary">inactive</span>;
  const label = `${tab.annotated} price${tab.annotated === 1 ? "" : "s"} annotated`;
  return (
    <span className="badge text-bg-danger">
      {tab.unparsable ? `${label}, ${tab.unparsable} n/a` : label}
    </span>
  );
}

/**
 * What one unit of each page currency is worth in `rates.base`.
 * @param props.currencies currency codes of the prices in the active tab
 */
function Rates({
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
    <>
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
    </>
  );
}
