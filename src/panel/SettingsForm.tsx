import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Currency } from "../core/currency/Currency.ts";
import { Settings } from "../core/settings/Settings.ts";

/** The settings entered in a number input. */
type NumericSetting = keyof typeof Settings.RANGES;

/** What the form holds: the inputs' text, so an emptied input stays empty while typing. */
type Draft = { currency: string } & Record<NumericSetting, string>;

/** How long the "Saved." note stays visible, in milliseconds. */
const SAVED_NOTE_MS = 2000;

const toDraft = (settings: Settings): Draft => ({
  currency: settings.currency,
  auctionPremium: String(settings.auctionPremium),
  shipment: String(settings.shipment),
});

/**
 * The settings form: currency, auction premium and shipment.
 * @param props.shown the settings to show; a new object (another auction, after
 *   saving) replaces whatever was typed, even when the settings are the same
 * @param props.shipmentCurrencies currencies of the page's prices, which the
 *   shipment is entered in
 * @param props.onCurrencyChange called with the picked currency
 * @param props.onSave called with the entered settings when they are valid; an
 *   emptied input keeps its shown value
 */
export function SettingsForm({
  shown,
  shipmentCurrencies,
  onCurrencyChange,
  onSave,
}: {
  shown: { readonly settings: Settings };
  shipmentCurrencies: readonly string[];
  onCurrencyChange: (code: string) => void;
  onSave: (settings: Settings) => Promise<void>;
}) {
  const { settings } = shown;
  const [draft, setDraft] = useState(() => toDraft(settings));
  // Reset the draft whenever settings are shown anew (React's "adjust state while rendering").
  const [base, setBase] = useState(shown);
  if (base !== shown) {
    setBase(shown);
    setDraft(toDraft(settings));
  }
  const [invalid, setInvalid] = useState<Partial<Record<NumericSetting, boolean>>>({});
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(savedTimer.current), []);
  const inputs = {
    auctionPremium: useRef<HTMLInputElement>(null),
    shipment: useRef<HTMLInputElement>(null),
  };

  /** A value of the form, as a number; an emptied input keeps the shown value. */
  const value = (name: NumericSetting) =>
    draft[name] === "" ? settings[name] : Number(draft[name]);
  // Compares values, not text: "7.0" for 7 is no change, and neither is an emptied input.
  const changed =
    draft.currency !== settings.currency ||
    (["auctionPremium", "shipment"] as const).some((name) => value(name) !== settings[name]);

  const enter = (name: NumericSetting, text: string) => {
    setDraft({ ...draft, [name]: text });
    setInvalid({ ...invalid, [name]: false });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // The inputs' own validation (min, max, step from Settings.RANGES and the markup).
    const flags = {
      auctionPremium: !inputs.auctionPremium.current?.checkValidity(),
      shipment: !inputs.shipment.current?.checkValidity(),
    };
    setInvalid(flags);
    if (flags.auctionPremium || flags.shipment) return;
    await onSave(
      Settings.from({
        currency: draft.currency,
        auctionPremium: value("auctionPremium"),
        shipment: value("shipment"),
      }),
    );
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), SAVED_NOTE_MS);
  };

  const numberInput = (name: NumericSetting, id: string, step: string, placeholder: string) => {
    const { min, max } = Settings.RANGES[name];
    return (
      <input
        ref={inputs[name]}
        type="number"
        className={`form-control${invalid[name] ? " is-invalid" : ""}`}
        id={id}
        min={min}
        max={Number.isFinite(max) ? max : undefined}
        step={step}
        inputMode="decimal"
        placeholder={placeholder}
        autoComplete="off"
        aria-describedby={`${id}-help`}
        value={draft[name]}
        onChange={(event) => enter(name, event.target.value)}
      />
    );
  };

  return (
    <form noValidate onSubmit={submit} aria-label="Settings">
      <fieldset className="d-flex flex-column gap-3">
        <Field
          id="currency"
          label="Currency"
          help="Currency you pay in; the exchange rate for the current page is shown below."
        >
          <select
            className="form-select"
            id="currency"
            aria-describedby="currency-help"
            value={draft.currency}
            onChange={(event) => {
              setDraft({ ...draft, currency: event.target.value });
              onCurrencyChange(event.target.value);
            }}
          >
            {Currency.CODES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </Field>

        <Field
          id="auction-premium"
          label="Auction premium"
          help="Buyer's premium the auction house adds on top of the hammer price."
        >
          <div className="input-group has-validation">
            {numberInput("auctionPremium", "auction-premium", "0.1", "0")}
            <span className="input-group-text">%</span>
            <div className="invalid-feedback">Enter a percentage between 0 and 100.</div>
          </div>
        </Field>

        <Field
          id="shipment"
          label="Shipment"
          help="Flat shipping cost per item in the auction's currency, added to every price on the page before it is converted."
        >
          <div className="input-group has-validation">
            {numberInput("shipment", "shipment", "0.01", "0.00")}
            <span className="input-group-text">
              {shipmentCurrencies.length ? shipmentCurrencies.join(" / ") : "–"}
            </span>
            <div className="invalid-feedback">Enter an amount of 0 or more.</div>
          </div>
        </Field>

        <div className="d-flex align-items-center gap-2">
          {/* Filled while there are unsaved changes, outlined otherwise. */}
          <button
            type="submit"
            className={`btn ${changed ? "btn-primary" : "btn-outline-primary"}`}
          >
            Save
          </button>
          <span className="text-success small" role="status" hidden={!saved}>
            Saved.
          </span>
        </div>
      </fieldset>
    </form>
  );
}

/** A labelled input with a "?" toggle that shows or hides its hint. */
function Field({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help: string;
  children: ReactNode;
}) {
  const [helpShown, setHelpShown] = useState(false);
  return (
    <div>
      <div className="form-label d-flex align-items-center justify-content-between">
        <label htmlFor={id}>{label}</label>
        <button
          type="button"
          className="help-toggle"
          aria-controls={`${id}-help`}
          aria-expanded={helpShown}
          aria-label={`Help on ${label.toLowerCase()}`}
          title="Help"
          onClick={() => setHelpShown(!helpShown)}
        >
          ?
        </button>
      </div>
      {children}
      <div id={`${id}-help`} className="form-text" hidden={!helpShown}>
        {help}
      </div>
    </div>
  );
}
