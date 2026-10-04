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
  /** @type {Settings | undefined} the settings last put into the form */
  #shown;

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
    /** @type {HTMLButtonElement} */
    this.saveButton = byId("save");
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
    // A <select> fires "input" too; "change" covers spinner clicks some browsers only report so.
    for (const type of ["input", "change"]) {
      this.form.addEventListener(type, () => this.#showChanged());
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
    this.#shown = settings;
    this.#showChanged();
  }

  /**
   * Whether the form differs from the settings last shown. Compares values, not
   * text: "7.0" for 7 is no change, and neither is an emptied input (it keeps
   * the value on Save). Typing the old value back counts as unchanged.
   * @returns {boolean}
   */
  isChanged() {
    const shown = this.#shown;
    if (!shown) return false;
    if (this.currency.value !== shown.currency) return true;
    return Object.entries(this.inputs).some(
      ([name, input]) => input.value !== "" && input.valueAsNumber !== shown[name],
    );
  }

  /** Fill the Save button while there are unsaved changes, outline it otherwise. */
  #showChanged() {
    const changed = this.isChanged();
    this.saveButton.classList.toggle("btn-primary", changed);
    this.saveButton.classList.toggle("btn-outline-primary", !changed);
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
