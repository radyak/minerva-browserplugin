import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Currency } from "../core/currency/Currency.ts";
import type { ExchangeRates } from "../core/rates/ExchangeRates.ts";
import { BuyerCosts, type NumericBuyerCost } from "../core/settings/BuyerCosts.ts";
import { Settings, type NumericSetting } from "../core/settings/Settings.ts";
import { PriceBreakdownView } from "./PriceBreakdownView.tsx";

/** Every value entered in a number input. */
type NumberField = NumericSetting | NumericBuyerCost;

/**
 * What the form holds: the inputs' text, so an emptied input stays empty while
 * typing, and the section switches.
 */
type Draft = {
  currency: string;
  /** the "VAT on the hammer price" switch */
  taxed: boolean;
  /** the "Your costs" switch */
  buyerEnabled: boolean;
} & Record<NumberField, string>;

/** The settings of the auction and the buyer's costs, as shown when the form was filled. */
export type ShownSettings = { readonly settings: Settings; readonly buyer: BuyerCosts };

/** How long the "Saved." note stays visible, in milliseconds. */
const SAVED_NOTE_MS = 2000;

const RANGES: Readonly<Record<NumberField, { min: number; max: number }>> = {
  ...Settings.RANGES,
  ...BuyerCosts.RANGES,
};

const isSetting = (name: NumberField): name is NumericSetting => name in Settings.RANGES;

const toDraft = ({ settings, buyer }: ShownSettings): Draft => ({
  currency: settings.currency,
  taxed: settings.hammerVat > 0,
  buyerEnabled: buyer.enabled,
  auctionPremium: String(settings.auctionPremium),
  shipment: String(settings.shipment),
  lotsWon: String(settings.lotsWon),
  // Empty rather than "0" when switched on: the rate has to be entered.
  hammerVat: settings.hammerVat > 0 ? String(settings.hammerVat) : "",
  importVat: String(buyer.importVat),
  paymentCosts: String(buyer.paymentCosts),
  flatFees: String(buyer.flatFees),
});

/**
 * The settings form, in two sections: "This auction" (currency, effective
 * premium, shipment split over the lots won, and - behind a switch - the VAT on
 * the hammer price), saved per auction, and "Your costs" (import VAT, payment
 * costs, flat fees - all behind one switch), saved once for every auction.
 * Below them a collapsible example of how a price adds up with the entered
 * values. Save stores both sections.
 * @param props.shown the values to show; a new object (another auction, after
 *   saving) replaces whatever was typed, even when the values are the same
 * @param props.pageCurrencies currencies of the page's prices, which the
 *   shipment is entered in
 * @param props.rates into the picked currency, for the example; undefined
 *   while loading, null when unavailable
 * @param props.onCurrencyChange called with the picked currency
 * @param props.onSave called with the entered values when they are valid; an
 *   emptied input keeps its shown value
 */
export function SettingsForm({
  shown,
  pageCurrencies,
  rates,
  onCurrencyChange,
  onSave,
}: {
  shown: ShownSettings;
  pageCurrencies: readonly string[];
  rates: ExchangeRates | null | undefined;
  onCurrencyChange: (code: string) => void;
  onSave: (settings: Settings, buyer: BuyerCosts) => Promise<void>;
}) {
  const [draft, setDraft] = useState(() => toDraft(shown));
  // Reset the draft whenever values are shown anew (React's "adjust state while rendering").
  const [base, setBase] = useState(shown);
  if (base !== shown) {
    setBase(shown);
    setDraft(toDraft(shown));
  }
  const [invalid, setInvalid] = useState<Partial<Record<NumberField, boolean>>>({});
  const [saved, setSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(savedTimer.current), []);
  /** the number inputs currently rendered (a switched off section has none) */
  const inputs = useRef(new Map<NumberField, HTMLInputElement>());

  const shownValue = (name: NumberField) =>
    isSetting(name) ? shown.settings[name] : shown.buyer[name];
  /** A value of the form, as a number; an emptied input keeps the shown value. */
  const value = (name: NumberField) => {
    if (name === "hammerVat" && !draft.taxed) return 0;
    return draft[name] === "" ? shownValue(name) : Number(draft[name]);
  };
  /** The entered values; anything invalid as its default, as when stored. */
  const entered = () => ({
    settings: Settings.from({
      currency: draft.currency,
      auctionPremium: value("auctionPremium"),
      shipment: value("shipment"),
      lotsWon: value("lotsWon"),
      hammerVat: value("hammerVat"),
    }),
    buyer: BuyerCosts.from({
      enabled: draft.buyerEnabled,
      importVat: value("importVat"),
      paymentCosts: value("paymentCosts"),
      flatFees: value("flatFees"),
    }),
  });
  // Compares values, not text: "7.0" for 7 is no change, and neither is an emptied input.
  const changed =
    draft.currency !== shown.settings.currency ||
    draft.buyerEnabled !== shown.buyer.enabled ||
    (Object.keys(RANGES) as NumberField[]).some((name) => value(name) !== shownValue(name));

  const enter = (name: NumberField, text: string) => {
    setDraft({ ...draft, [name]: text });
    setInvalid({ ...invalid, [name]: false });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    // The inputs' own validation (min, max, step, required from RANGES and the markup).
    const flags = Object.fromEntries(
      [...inputs.current].map(([name, input]) => [name, !input.checkValidity()]),
    );
    setInvalid(flags);
    if (Object.values(flags).some(Boolean)) return;
    const { settings, buyer } = entered();
    await onSave(settings, buyer);
    setSaved(true);
    clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setSaved(false), SAVED_NOTE_MS);
  };

  /**
   * A number input for `name`, with the unit after it and the message shown when invalid.
   * @param options.step the smallest change; "1" also rules out fractions
   */
  const numberInput = (
    name: NumberField,
    id: string,
    {
      step,
      placeholder,
      unit,
      feedback,
      required = false,
    }: {
      step: string;
      placeholder: string;
      unit?: ReactNode;
      feedback: string;
      required?: boolean;
    },
  ) => {
    const { min, max } = RANGES[name];
    return (
      <div className="input-group has-validation">
        <input
          ref={(element) => {
            if (element) inputs.current.set(name, element);
            else inputs.current.delete(name);
          }}
          type="number"
          className={`form-control${invalid[name] ? " is-invalid" : ""}`}
          id={id}
          min={min}
          max={Number.isFinite(max) ? max : undefined}
          step={step}
          required={required}
          inputMode={step === "1" ? "numeric" : "decimal"}
          placeholder={placeholder}
          autoComplete="off"
          aria-describedby={`${id}-help`}
          value={draft[name]}
          onChange={(event) => enter(name, event.target.value)}
        />
        {unit !== undefined && <span className="input-group-text">{unit}</span>}
        <div className="invalid-feedback">{feedback}</div>
      </div>
    );
  };
  const percent = (name: NumberField, id: string, placeholder = "0", required = false) =>
    numberInput(name, id, {
      step: "0.1",
      placeholder,
      unit: "%",
      feedback: "Enter a percentage between 0 and 100.",
      required,
    });
  const shipmentUnit = pageCurrencies.length ? pageCurrencies.join(" / ") : "–";

  return (
    <form noValidate onSubmit={submit} aria-label="Settings">
      <div className="d-flex flex-column gap-3">
        <fieldset className="d-flex flex-column gap-3">
          <legend className="section-legend">This auction</legend>
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
            help="Everything the auction house charges as a percentage of the hammer price, added up into one effective premium: the buyer's premium including its VAT (20 % + 19 % VAT = 23.8 %) and any online or live bidding surcharge (e.g. + 3 %)."
          >
            {percent("auctionPremium", "auction-premium")}
          </Field>

          <div className="row g-2">
            <div className="col-7">
              <Field
                id="shipment"
                label="Shipment"
                help="Shipping and insurance per invoice, in the auction's currency. It is split over the lots you expect to win and converted with the price."
              >
                {numberInput("shipment", "shipment", {
                  step: "0.01",
                  placeholder: "0.00",
                  unit: shipmentUnit,
                  feedback: "Enter an amount of 0 or more.",
                })}
              </Field>
            </div>
            <div className="col-5">
              <Field
                id="lots-won"
                label="Lots won"
                help="How many lots you expect to win in this auction. The shipment and your flat fees are charged once per invoice, so each lot carries its share."
              >
                {numberInput("lotsWon", "lots-won", {
                  step: "1",
                  placeholder: "1",
                  feedback: "Enter a whole number from 1.",
                })}
              </Field>
            </div>
          </div>

          <Switch
            id="taxed"
            label="VAT on the hammer price"
            hint="For regularly taxed lots and lots imported by the auction house."
            checked={draft.taxed}
            onChange={(taxed) => setDraft({ ...draft, taxed })}
          />
          {draft.taxed && (
            <div className="switched-part">
              <Field
                id="hammer-vat"
                label="Hammer price VAT"
                help="The VAT rate on the hammer price, e.g. 19 %. Enter the premium above including its VAT; this rate only applies to the hammer price."
              >
                {percent("hammerVat", "hammer-vat", "19", true)}
              </Field>
            </div>
          )}
        </fieldset>

        <fieldset className="d-flex flex-column gap-3">
          <legend className="section-legend">
            Your costs <span className="fw-normal text-body-secondary">· all auctions</span>
          </legend>
          <Switch
            id="buyer-enabled"
            label="Add import and payment costs"
            hint="What arrives on top of the invoice, the same for every auction."
            checked={draft.buyerEnabled}
            onChange={(buyerEnabled) => setDraft({ ...draft, buyerEnabled })}
          />
          {draft.buyerEnabled && (
            <div className="switched-part d-flex flex-column gap-3">
              <Field
                id="import-vat"
                label="Import VAT"
                help="Charged on lots shipped in from outside your customs area, e.g. 7 % for collector coins in Germany. Leave at 0 for lots that already carry VAT."
              >
                {percent("importVat", "import-vat")}
              </Field>
              <Field
                id="payment-costs"
                label="Payment costs"
                help="Add up what paying costs you as a percentage: your bank's or card's markup on the exchange rate (often 1-3 %) and any surcharge for the payment method (e.g. 3 % by card)."
              >
                {percent("paymentCosts", "payment-costs")}
              </Field>
              <Field
                id="flat-fees"
                label="Flat fees"
                help="Add up the fixed amounts per invoice, in your currency: customs clearance by the post or courier, bank transfer fees. Split over the lots you expect to win."
              >
                {numberInput("flatFees", "flat-fees", {
                  step: "0.01",
                  placeholder: "0.00",
                  unit: draft.currency,
                  feedback: "Enter an amount of 0 or more.",
                })}
              </Field>
            </div>
          )}
        </fieldset>

        <PriceBreakdownView
          {...entered()}
          currency={pageCurrencies[0] ?? draft.currency}
          rates={rates}
        />

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
      </div>
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

/** A switch that shows or hides a part of the form, with a one-line hint below. */
function Switch({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="form-check form-switch mb-0">
      <input
        className="form-check-input"
        type="checkbox"
        role="switch"
        id={id}
        checked={checked}
        aria-describedby={`${id}-hint`}
        onChange={(event) => onChange(event.target.checked)}
      />
      <label className="form-check-label" htmlFor={id}>
        {label}
      </label>
      <div id={`${id}-hint`} className="form-text mt-0">
        {hint}
      </div>
    </div>
  );
}
