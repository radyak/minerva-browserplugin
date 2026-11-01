// @vitest-environment jsdom
import assert from "node:assert/strict";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, test } from "vitest";

import { MSG } from "../src/core/messages.ts";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.ts";
import { AuctionKey } from "../src/core/settings/AuctionKey.ts";
import { Settings } from "../src/core/settings/Settings.ts";
import { defineSite } from "../src/core/sites/sites.ts";
import { Panel } from "../src/panel/Panel.tsx";
import { bookOf, fakeBus, fakeStore, settle } from "./support/fakes.ts";

afterEach(cleanup);

const GBP = new Settings({ auctionPremium: 20, shipment: 7, currency: "GBP" });
const ratesOf = (base: string) =>
  new ExchangeRates(base, "2026-09-25", { EUR: 1.1, USD: 1.2, GBP: 0.9, CHF: 0.95 });

/** Rates the background loads; the test resolves or rejects each request by hand. */
function manualClient() {
  const pending: Array<{ base: string; resolve: (r: ExchangeRates) => void; reject: any }> = [];
  return {
    pending,
    fetch: (base: string) =>
      new Promise<ExchangeRates>((resolve, reject) => pending.push({ base, resolve, reject })),
    /** Answer the oldest open request with rates for its base. */
    answer() {
      const request = pending.shift()!;
      request.resolve(ratesOf(request.base));
    },
  };
}

/** A fake `tabs` API recording its listeners. */
function fakeTabs(activeTab: unknown) {
  const listeners = { activated: new Set<any>(), updated: new Set<any>() };
  const event = (set: Set<any>) => ({
    addListener: (listener: any) => set.add(listener),
    removeListener: (listener: any) => set.delete(listener),
  });
  return {
    query: async () => (activeTab ? [activeTab] : []),
    onActivated: event(listeners.activated),
    onUpdated: event(listeners.updated),
    activated: (...args: unknown[]) => listeners.activated.forEach((listener) => listener(...args)),
    updated: (...args: unknown[]) => listeners.updated.forEach((listener) => listener(...args)),
  };
}

const SHOP = "https://shop.test";
const SITES = [
  defineSite({
    origin: SHOP,
    paths: ["/lot/*"],
    priceSelectors: [".price"],
    ids: { house: { query: "h" }, auction: { path: "/lot/:id" } },
  }),
];

/** What the active tab reports: prices in USD, on a page of house "leu". */
const ON_USD_PAGE = {
  active: true,
  annotated: 3,
  unparsable: 1,
  currencies: ["USD"],
  site: SHOP,
  house: "leu",
  auction: null,
};

/** Run what is pending (answers, effects, renders) inside act(). */
const flush = () =>
  act(async () => {
    await settle();
    await settle();
  });

/**
 * Render the panel; resolves once it has settled.
 * @param options.state what the content script of the active `tab` answers
 *   (null: there is none); `setState()` changes it later
 * @param options.client the background's rates source
 */
async function openPanel({
  book = bookOf([{ site: SHOP }, GBP]),
  client = undefined as any,
  state = ON_USD_PAGE as object | null,
  tab = { id: 1, url: `${SHOP}/lot/1` } as object | null,
  settled = true,
  version = undefined as string | undefined,
} = {}) {
  let current = state;
  const tabs = fakeTabs(tab);
  const rates = client ?? { fetch: async (base: string) => ratesOf(base) };
  const bus = fakeBus({
    answers: {
      tab: () => current,
      // What BackgroundController.ratesFor() answers.
      [MSG.GET_RATES]: async ({ base }: { base: string }) => {
        try {
          return { rates: (await rates.fetch(base)).toJSON() };
        } catch (error: any) {
          return { error: error.message };
        }
      },
    },
  });
  const store = fakeStore({ book });
  const view = render(
    <Panel tabs={tabs as any} bus={bus} store={store} sites={SITES} version={version} />,
  );
  if (settled) await flush();
  /** The tab now reports `changes` on top of ON_USD_PAGE and tells the panel so. */
  const navigate = async (changes: object) => {
    current = { ...ON_USD_PAGE, ...changes };
    bus.deliver({ type: MSG.STATE_CHANGED });
    await flush();
  };
  return { ...view, tabs, bus, store, navigate };
}

const input = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const form = () => document.querySelector("form");
const status = () => document.querySelector(".card-body .badge")!.textContent;
const ratesInfo = () => document.querySelector(".card-body .form-text")!;
const shipmentCurrency = () => input("Shipment").nextElementSibling!.textContent;
/** The ID shown next to `label` ("Auction house", "Auction") at the top. */
const shownId = (label: string) =>
  screen.getByRole("cell", { name: label }).nextElementSibling!.textContent;
const saveButton = () => screen.getByRole("button", { name: "Save" });
const savedNote = () => screen.getByText("Saved.");

/** Where the form's values come from: the title of the highlighted pill. */
const source = () => {
  const current = document.querySelectorAll("[aria-current]");
  assert.equal(current.length, 1);
  return (current[0] as HTMLElement).title;
};

/** The rate rows as text; the decimal comma of some locales read as a point. */
const rateRows = () =>
  [...document.querySelectorAll(".card-body tbody tr")].map((row) =>
    row.textContent.replace(/\s+/g, " ").replace(/(\d),(\d)/g, "$1.$2"),
  );

const type = (label: string, value: string) =>
  fireEvent.change(input(label), { target: { value } });
const submit = async () => {
  fireEvent.submit(form()!);
  await flush();
};

test("shows the saved settings, the rates and the status on open", async () => {
  const { store } = await openPanel();
  assert.deepEqual(
    [...(input("Currency") as unknown as HTMLSelectElement).options].map((o) => o.value),
    ["EUR", "USD", "GBP", "CHF"],
  );
  assert.equal(input("Currency").value, "GBP");
  assert.equal(input("Auction premium").value, "20");
  assert.equal(input("Shipment").value, "7");
  // Entered in the currency of the page's prices, not the selected one.
  assert.equal(shipmentCurrency(), "USD");
  assert.equal(source(), "Saved for this site.");
  assert.equal(input("Auction premium").max, "100");
  assert.equal(input("Auction premium").min, "0");
  // Only the rate the page needs: 1 GBP = 1.2 USD.
  assert.deepEqual(rateRows(), ["1 USD =0.8333 GBP"]);
  assert.match(ratesInfo().textContent, /2026-09-25/);
  assert.equal(status(), "3 prices annotated, 1 n/a");
  assert.equal(shownId("Auction house"), "leu");
  assert.equal(shownId("Auction"), "unknown");
  // Keeping the saved rates fresh is the background's job.
  assert.deepEqual(store.savedRates, []);
});

test("shows the form and the auction only while the tab is on an auction", async () => {
  await openPanel();
  assert.ok(form());
  assert.equal(screen.queryByText(/No auction/), null);
  assert.deepEqual(
    [...screen.getByLabelText("Values from").children].map((pill) => pill.textContent),
    ["Auction", "House", "Site", "Defaults"],
  );
  assert.equal(document.querySelector("[aria-current]")!.textContent, "Site");
  cleanup();

  // On a site, but neither house nor auction in the URL.
  await openPanel({ state: { ...ON_USD_PAGE, house: null } });
  assert.equal(form(), null);
  assert.equal(screen.queryByText("Auction house"), null);
  screen.getByText("No auction detected on this page");
  assert.equal(status(), "3 prices annotated, 1 n/a");
  cleanup();

  // The auction alone is enough.
  await openPanel({ state: { ...ON_USD_PAGE, house: null, auction: "7" } });
  assert.ok(form());
  assert.equal(shownId("Auction house"), "unknown");
  assert.equal(shownId("Auction"), "7");
  cleanup();

  await openPanel({ state: { active: false }, settled: false });
  assert.equal(form(), null); // until the state is known
  assert.equal(status(), "checking…");
  await flush();
  assert.equal(form(), null);
  screen.getByText("No auction or platform active");
  assert.equal(status(), "inactive");
  assert.equal(screen.queryByText("Auction house"), null);
});

test("judges the active tab by its URL when it has no content script", async () => {
  await openPanel({ state: null, tab: { id: 1, url: `${SHOP}/lot/7?h=leu` } });
  assert.equal(status(), "0 prices annotated");
  assert.equal(shownId("Auction house"), "leu");
  assert.equal(shownId("Auction"), "7");
  assert.ok(form());
});

test("is inactive without an active tab", async () => {
  const { bus } = await openPanel({ tab: null });
  assert.equal(status(), "inactive");
  assert.equal(form(), null);
  assert.deepEqual(bus.sentToTabs, []);
});

test("shows no rate when the page needs none", async () => {
  await openPanel({ state: { ...ON_USD_PAGE, currencies: ["GBP"] } });
  assert.deepEqual(rateRows(), []);
  assert.equal(ratesInfo().textContent, "Prices on this page are in GBP.");
  cleanup();

  await openPanel({ state: { active: false } });
  assert.deepEqual(rateRows(), []);
  assert.equal(ratesInfo().textContent, "No prices on this page.");
});

test("follows the currencies of the active tab", async () => {
  const { navigate } = await openPanel();
  await navigate({ currencies: ["CHF", "EUR"] });
  assert.deepEqual(rateRows(), ["1 CHF =1.0526 GBP", "1 EUR =0.9091 GBP"]);
});

test("shows an input's hint only while its help toggle is on", async () => {
  await openPanel();
  const toggle = screen.getByRole("button", { name: "Help on shipment" });
  const hint = (id: string) => document.getElementById(id)!;
  assert.equal(hint("shipment-help").hidden, true);
  assert.equal(hint("currency-help").hidden, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");

  fireEvent.click(toggle);
  assert.equal(hint("shipment-help").hidden, false);
  assert.equal(hint("currency-help").hidden, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "true");

  fireEvent.click(toggle);
  assert.equal(hint("shipment-help").hidden, true);
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
});

test("saves the entered settings with the matching rates in one go", async () => {
  const { store, bus } = await openPanel();
  assert.equal(savedNote().hidden, true);
  type("Auction premium", "25");
  type("Shipment", "");
  await submit();
  assert.deepEqual(store.saved, [
    {
      // Under the key of the page: house "leu", auction unknown.
      key: AuctionKey.from({ site: SHOP, house: "leu" }),
      settings: new Settings({ auctionPremium: 25, shipment: 7, currency: "GBP" }),
      rates: ratesOf("GBP"),
    },
  ]);
  // The emptied input shows the kept value again.
  assert.equal(input("Shipment").value, "7");
  assert.equal(source(), "Saved for this auction house.");
  assert.equal(savedNote().hidden, false);
  // Asked the tab on open and after saving: it re-reads the settings and recalculates.
  assert.deepEqual(bus.sentToTabs, [
    [1, { type: MSG.SYNC_REQUEST }],
    [1, { type: MSG.SYNC_REQUEST }],
  ]);
});

test("does not save invalid input", async () => {
  const { store } = await openPanel();
  type("Auction premium", "150");
  await submit();
  assert.deepEqual(store.saved, []);
  assert.equal(input("Auction premium").classList.contains("is-invalid"), true);
  type("Auction premium", "15");
  assert.equal(input("Auction premium").classList.contains("is-invalid"), false);
});

test("fills the Save button only while the form differs from the saved settings", async () => {
  await openPanel();
  const filled = () => saveButton().classList.contains("btn-primary");
  const outlined = () => saveButton().classList.contains("btn-outline-primary");
  assert.equal(filled(), false);
  assert.equal(outlined(), true);

  type("Auction premium", "25");
  assert.equal(filled(), true);
  assert.equal(outlined(), false);
  type("Auction premium", "20.0"); // the saved value again
  assert.equal(filled(), false);
  type("Shipment", ""); // emptied keeps the saved value
  assert.equal(filled(), false);
  fireEvent.change(input("Currency"), { target: { value: "EUR" } });
  assert.equal(filled(), true);

  await submit();
  assert.equal(filled(), false);
  assert.equal(outlined(), true);
});

test("only shows the rates of the currency picked last", async () => {
  const client = manualClient();
  await openPanel({ client });
  await act(async () => client.answer()); // GBP, on open
  await flush();

  fireEvent.change(input("Currency"), { target: { value: "USD" } });
  fireEvent.change(input("Currency"), { target: { value: "CHF" } });
  await flush();
  assert.equal(ratesInfo().textContent, "Loading…");

  await act(async () => client.answer()); // USD - superseded, must not show
  await flush();
  assert.equal(ratesInfo().textContent, "Loading…");
  await act(async () => client.answer()); // CHF
  await flush();
  assert.match(rateRows()[0]!, /^1 USD =.* CHF$/);
  assert.equal(shipmentCurrency(), "USD"); // the page's, whatever is picked
});

test("saves the rates of the picked currency once they have arrived", async () => {
  const client = manualClient();
  const { store } = await openPanel({ client });
  await act(async () => client.answer()); // GBP
  fireEvent.change(input("Currency"), { target: { value: "CHF" } });
  await flush();
  fireEvent.submit(form()!); // while the CHF rates are still loading
  await act(async () => client.answer());
  await flush();
  assert.equal(store.saved.length, 1);
  assert.deepEqual(store.saved[0].rates, ratesOf("CHF"));
});

test("saves settings without rates when they could not be loaded", async () => {
  const client = manualClient();
  const { store } = await openPanel({ client });
  await act(async () => client.pending.shift()!.reject(new Error("offline")));
  await flush();
  assert.equal(ratesInfo().textContent, "Exchange rates unavailable.");
  assert.equal(ratesInfo().classList.contains("text-danger"), true);

  await submit();
  assert.equal(store.saved.length, 1);
  assert.equal(store.saved[0].rates, undefined);
});

test("refreshes the status on state changes, tab switches and navigation", async () => {
  const { tabs, bus } = await openPanel();
  const before = bus.sentToTabs.length;
  await act(async () => {
    bus.deliver({ type: MSG.STATE_CHANGED });
    tabs.activated({ tabId: 2 });
    tabs.updated(2, { status: "complete" });
    tabs.updated(2, { status: "loading" }); // not yet: ignored
  });
  await flush();
  assert.equal(bus.sentToTabs.length, before + 3);
});

test("stops listening once closed", async () => {
  const { tabs, bus, unmount } = await openPanel();
  unmount();
  const before = bus.sentToTabs.length;
  bus.deliver({ type: MSG.STATE_CHANGED });
  tabs.activated({ tabId: 2 });
  tabs.updated(2, { status: "complete" });
  await settle();
  assert.equal(bus.sentToTabs.length, before);
});

test("shows the currencies of the page's prices next to the shipment", async () => {
  const { navigate } = await openPanel({ state: { ...ON_USD_PAGE, currencies: [] } });
  assert.equal(shipmentCurrency(), "–"); // no price found yet
  await navigate({ currencies: ["USD", "CHF"] });
  assert.equal(shipmentCurrency(), "CHF / USD");
});

test("fills the form with the settings of the auction the active tab is on", async () => {
  const CHF = new Settings({ auctionPremium: 10, shipment: 3, currency: "CHF" });
  const book = bookOf(
    [{ site: SHOP }, GBP],
    [{ site: SHOP, house: "cng", auction: "2" }, CHF],
    [{ site: SHOP, house: "leu", auction: "1" }, CHF],
  );
  const { navigate } = await openPanel({ book, state: { ...ON_USD_PAGE, auction: "1" } });
  const showing = () => [input("Currency").value, input("Auction premium").value, source()];
  assert.deepEqual(showing(), ["CHF", "10", "Saved for this auction."]);

  // Same auction: what is being typed stays.
  type("Auction premium", "12");
  await navigate({ auction: "1", annotated: 5 });
  assert.equal(input("Auction premium").value, "12");

  await navigate({ house: "cng", auction: "2" });
  assert.deepEqual(showing(), ["CHF", "10", "Saved for this auction."]);
  await navigate({ house: "leu", auction: "9" });
  assert.deepEqual(showing(), ["CHF", "10", "Saved for this auction house."]);
  await navigate({ house: "nac", auction: "9" });
  assert.deepEqual(showing(), ["CHF", "10", "Saved for this site."]);
  await navigate({ site: "https://other.test", house: "leu", auction: "1" });
  assert.deepEqual(showing(), ["EUR", "0", "Nothing saved yet: defaults."]);
  assert.ok(form());
  await navigate({ house: null, auction: null });
  assert.equal(form(), null);
});

test("saves for the auction of the active tab, from the defaults when nothing was saved", async () => {
  const { store } = await openPanel({
    book: bookOf(),
    state: { ...ON_USD_PAGE, house: "leu", auction: "3" },
  });
  assert.equal(source(), "Nothing saved yet: defaults.");
  type("Auction premium", "15");
  type("Shipment", "");
  await submit();
  assert.deepEqual(
    store.saved.map(({ key, settings }) => [key, settings]),
    [
      [
        AuctionKey.from({ site: SHOP, house: "leu", auction: "3" }),
        new Settings({ auctionPremium: 15, shipment: 0, currency: Settings.DEFAULT.currency }),
      ],
    ],
  );
  assert.equal(source(), "Saved for this auction.");
});

test("offers nothing to save while the active tab is on no auction", async () => {
  for (const state of [{ active: false }, { ...ON_USD_PAGE, house: null, auction: null }]) {
    await openPanel({ state });
    assert.equal(form(), null);
    assert.equal(screen.queryByRole("button", { name: "Save" }), null);
    cleanup();
  }
});

test("the Saved. note disappears after two seconds", async () => {
  const { store } = await openPanel();
  await submit();
  assert.equal(store.saved.length, 1);
  assert.equal(savedNote().hidden, false);
  await act(() => new Promise((resolve) => setTimeout(resolve, 2050)));
  assert.equal(within(form()!).getByText("Saved.").hidden, true);
});

test("shows the build version at the bottom of the panel", async () => {
  await openPanel({ version: "1.2.3+abc1234" });
  screen.getByText("v1.2.3+abc1234");
});

test("shows the development version when none is passed", async () => {
  await openPanel();
  screen.getByText("v0.0.0-dev");
});
