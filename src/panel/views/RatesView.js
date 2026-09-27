/** The exchange rates table in the "Plugin status" card. */
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
   * Show the rates of `rates.base` against the other currencies.
   * @param {import("../../core/rates/ExchangeRates.js").ExchangeRates} rates
   */
  show({ base, date, rates }) {
    const doc = this.body.ownerDocument;
    this.body.replaceChildren(
      ...Object.entries(rates).map(([code, rate]) => {
        const row = doc.createElement("tr");
        const pair = doc.createElement("td");
        const value = doc.createElement("td");
        pair.textContent = `1 ${base} =`;
        value.textContent = `${rate.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${code}`;
        value.className = "text-end";
        row.append(pair, value);
        return row;
      }),
    );
    this.#showInfo(`ECB reference rates of ${date}`);
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
