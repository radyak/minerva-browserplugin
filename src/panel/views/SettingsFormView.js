import { Currency } from "../../core/currency/Currency.js";
import { Settings } from "../../core/settings/Settings.js";

/** How long the "Saved." note stays visible, in milliseconds. */
const SAVED_NOTE_MS = 2000;

/**
 * The settings form: currency, auction premium and shipment. Knows the markup
 * of panel.html; turns Settings into inputs and back.
 */
export class SettingsFormView {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #savedTimer;

  /** @param {Document} doc the panel document */
  constructor(doc) {
    const byId = (id) => /** @type {any} */ (doc.getElementById(id));
    /** @type {HTMLFormElement} */
    this.form = byId("settings");
    /** @type {HTMLSelectElement} */
    this.currency = byId("currency");
    /** @type {HTMLElement} */
    this.shipmentCurrency = byId("shipment-currency");
    /** @type {HTMLElement} */
    this.saved = byId("saved");
    /** @type {Record<"auctionPremium" | "shipment", HTMLInputElement>} */
    this.inputs = { auctionPremium: byId("auction-premium"), shipment: byId("shipment") };

    this.currency.replaceChildren(
      ...Currency.CODES.map((code) => new doc.defaultView.Option(code, code)),
    );
    for (const [name, input] of Object.entries(this.inputs)) {
      // The accepted ranges come from Settings, so the validation matches what is read back.
      const { min, max } = Settings.RANGES[name];
      input.min = String(min);
      if (Number.isFinite(max)) input.max = String(max);
      input.addEventListener("input", () => input.classList.remove("is-invalid"));
    }
  }

  /** @param {(event: SubmitEvent) => void} handler called on Save; the default is prevented */
  onSubmit(handler) {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      handler(/** @type {SubmitEvent} */ (event));
    });
  }

  /** @param {(code: string) => void} handler called when the user picks another currency */
  onCurrencyChange(handler) {
    this.currency.addEventListener("change", () => handler(this.currency.value));
  }

  /**
   * Put `settings` into the form.
   * @param {Settings} settings
   */
  show(settings) {
    this.currency.value = settings.currency;
    for (const [name, input] of Object.entries(this.inputs)) input.value = String(settings[name]);
  }

  /** @param {string} code the currency the shipment is entered in */
  showCurrency(code) {
    this.shipmentCurrency.textContent = code;
  }

  /**
   * The settings as entered; an emptied input keeps its value from `current`.
   * @param {Settings} current
   * @returns {Settings}
   */
  read(current) {
    /** @param {"auctionPremium" | "shipment"} name */
    const value = (name) => {
      const input = this.inputs[name];
      return input.value === "" ? current[name] : input.valueAsNumber;
    };
    return Settings.from({
      auctionPremium: value("auctionPremium"),
      shipment: value("shipment"),
      currency: this.currency.value,
    });
  }

  /**
   * Flag invalid inputs.
   * @returns {boolean} true when every input may be saved
   */
  validate() {
    let valid = true;
    for (const input of Object.values(this.inputs)) {
      const ok = input.checkValidity();
      input.classList.toggle("is-invalid", !ok);
      valid &&= ok;
    }
    return valid;
  }

  /** Show the "Saved." note for a moment. */
  showSaved() {
    this.saved.hidden = false;
    clearTimeout(this.#savedTimer);
    this.#savedTimer = setTimeout(() => {
      this.saved.hidden = true;
    }, SAVED_NOTE_MS);
  }
}
