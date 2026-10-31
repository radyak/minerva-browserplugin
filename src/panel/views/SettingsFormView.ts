import { Currency } from "../../core/currency/Currency.ts";
import { Settings } from "../../core/settings/Settings.ts";

/** The settings entered in a number input. */
type NumericSetting = keyof typeof Settings.RANGES;

/** How long the "Saved." note stays visible, in milliseconds. */
const SAVED_NOTE_MS = 2000;

/**
 * The settings form: currency, auction premium and shipment. Knows the markup
 * of the side panel page; turns Settings into inputs and back.
 */
export class SettingsFormView {
  #savedTimer: ReturnType<typeof setTimeout> | undefined;
  /** the settings last put into the form */
  #shown: Settings | undefined;
  readonly form: HTMLFormElement;
  readonly currency: HTMLSelectElement;
  readonly shipmentCurrency: HTMLElement;
  readonly saved: HTMLElement;
  readonly saveButton: HTMLButtonElement;
  readonly inputs: Record<NumericSetting, HTMLInputElement>;

  /** @param doc the panel document */
  constructor(doc: Document) {
    // The panel markup is fixed (index.html); a missing element is a bug there.
    const byId = <T extends HTMLElement>(id: string) => doc.getElementById(id) as T;
    this.form = byId("settings");
    this.currency = byId("currency");
    this.shipmentCurrency = byId("shipment-currency");
    this.saved = byId("saved");
    this.saveButton = byId("save");
    this.inputs = { auctionPremium: byId("auction-premium"), shipment: byId("shipment") };

    const { Option } = doc.defaultView!;
    this.currency.replaceChildren(...Currency.CODES.map((code) => new Option(code, code)));
    for (const [name, input] of this.#inputEntries()) {
      // The accepted ranges come from Settings, so the validation matches what is read back.
      const { min, max } = Settings.RANGES[name];
      input.min = String(min);
      if (Number.isFinite(max)) input.max = String(max);
      input.addEventListener("input", () => input.classList.remove("is-invalid"));
    }
    // The hints below the inputs stay hidden until their "?" next to the label is clicked.
    for (const toggle of this.form.querySelectorAll(".help-toggle")) {
      const hint = byId(toggle.getAttribute("aria-controls") ?? "");
      toggle.addEventListener("click", () => {
        hint.hidden = !hint.hidden;
        toggle.setAttribute("aria-expanded", String(!hint.hidden));
      });
    }
    // A <select> fires "input" too; "change" covers spinner clicks some browsers only report so.
    for (const type of ["input", "change"]) {
      this.form.addEventListener(type, () => this.#showChanged());
    }
  }

  /** @param handler called on Save; the default is prevented */
  onSubmit(handler: (event: SubmitEvent) => void): void {
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      handler(event);
    });
  }

  /** @param handler called when the user picks another currency */
  onCurrencyChange(handler: (code: string) => void): void {
    this.currency.addEventListener("change", () => handler(this.currency.value));
  }

  /**
   * Put `settings` into the form.
   */
  show(settings: Settings): void {
    this.currency.value = settings.currency;
    for (const [name, input] of this.#inputEntries()) input.value = String(settings[name]);
    this.#shown = settings;
    this.#showChanged();
  }

  /**
   * Whether the form differs from the settings last shown. Compares values, not
   * text: "7.0" for 7 is no change, and neither is an emptied input (it keeps
   * the value on Save). Typing the old value back counts as unchanged.
   */
  isChanged(): boolean {
    const shown = this.#shown;
    if (!shown) return false;
    if (this.currency.value !== shown.currency) return true;
    return this.#inputEntries().some(
      ([name, input]) => input.value !== "" && input.valueAsNumber !== shown[name],
    );
  }

  /** Fill the Save button while there are unsaved changes, outline it otherwise. */
  #showChanged(): void {
    const changed = this.isChanged();
    this.saveButton.classList.toggle("btn-primary", changed);
    this.saveButton.classList.toggle("btn-outline-primary", !changed);
  }

  /**
   * Show the currency the shipment is entered in: the one of the auction's prices.
   * @param codes currencies of the prices on the page; "–" while none is
   *   known, all of them when the page mixes several
   */
  showShipmentCurrency(codes: readonly string[]): void {
    const text = codes.length ? codes.join(" / ") : "–";
    if (this.shipmentCurrency.textContent !== text) this.shipmentCurrency.textContent = text;
  }

  /**
   * The settings as entered; an emptied input keeps its value from `current`.
   */
  read(current: Settings): Settings {
    const value = (name: NumericSetting) => {
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
   * @returns true when every input may be saved
   */
  validate(): boolean {
    let valid = true;
    for (const input of Object.values(this.inputs)) {
      const ok = input.checkValidity();
      input.classList.toggle("is-invalid", !ok);
      valid &&= ok;
    }
    return valid;
  }

  #inputEntries(): Array<[NumericSetting, HTMLInputElement]> {
    return Object.entries(this.inputs) as Array<[NumericSetting, HTMLInputElement]>;
  }

  /** Show the "Saved." note for a moment. */
  showSaved(): void {
    this.saved.hidden = false;
    clearTimeout(this.#savedTimer);
    this.#savedTimer = setTimeout(() => {
      this.saved.hidden = true;
    }, SAVED_NOTE_MS);
  }
}
