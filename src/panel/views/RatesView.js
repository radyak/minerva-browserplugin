/**
 * The exchange rate in the "Plugin status" card: only the rates the active
 * tab needs, i.e. from the currencies of its prices into the selected one.
 */
export class RatesView {
  /**
   * @param {object} elements
   * @param {HTMLElement} elements.body the table body holding one row per rate
   * @param {HTMLElement} elements.info the line below the table
   */
  constructor({ body, info }) {
    this.body = body;
    this.info = info;
  }

  showLoading() {
    this.body.replaceChildren();
    this.#showInfo("Loading…");
  }

  /**
   * Show what one unit of each page currency is worth in `rates.base`.
   * @param {import("../../core/rates/ExchangeRates.js").ExchangeRates} rates
   * @param {readonly string[]} currencies currency codes of the prices in the active tab
   */
  show(rates, currencies) {
    const doc = this.body.ownerDocument;
    const foreign = currencies.filter((code) => code !== rates.base);
    this.body.replaceChildren(
      ...foreign.map((code) => {
        const factor = rates.factorFrom(code);
        const row = doc.createElement("tr");
        const pair = doc.createElement("td");
        const value = doc.createElement("td");
        pair.textContent = `1 ${code} =`;
        value.textContent =
          factor === undefined
            ? "n/a"
            : `${factor.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${rates.base}`;
        value.className = "text-end";
        row.append(pair, value);
        return row;
      }),
    );
    if (foreign.length) this.#showInfo(`ECB reference rate of ${rates.date}`);
    else if (currencies.length) this.#showInfo(`Prices on this page are in ${rates.base}.`);
    else this.#showInfo("No prices on this page.");
  }

  showError() {
    this.body.replaceChildren();
    this.#showInfo("Exchange rates unavailable.", true);
  }

  #showInfo(text, error = false) {
    this.info.textContent = text;
    this.info.classList.toggle("text-danger", error);
  }
}
