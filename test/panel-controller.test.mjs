import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { JSDOM } from "jsdom";

import { MSG } from "../src/core/messages.js";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.js";
import { Settings } from "../src/core/settings/Settings.js";
import { PanelController } from "../src/panel/PanelController.js";
import { RatesService } from "../src/panel/RatesService.js";
import { fakeBus, fakeStore, settle } from "./support/fakes.mjs";

/** The real panel markup, without its script. */
const PANEL_HTML = readFileSync(
  new URL("../src/panel/panel.html", import.meta.url),
  "utf8",
).replace(/<script[^>]*><\/script>/, "");

const GBP = new Settings({ auctionPremium: 20, shipment: 7, currency: "GBP" });
const ratesOf = (base) =>
  new ExchangeRates(base, "2026-09-25", { EUR: 1.1, USD: 1.2, GBP: 0.9, CHF: 0.95 });

/** A rates client whose requests the test resolves or rejects by hand. */
function manualClient() {
  const pending = [];
  return {
    pending,
    fetch: (base) => new Promise((resolve, reject) => pending.push({ base, resolve, reject })),
    /** Answer the oldest open request with rates for its base. */
    answer() {
      const request = pending.shift();
      request.resolve(ratesOf(request.base));
    },
  };
}

/** A fake `tabs` API recording its listeners. */
function fakeTabs() {
  const activated = [];
  const updated = [];
  return {
    activated,
    updated,
    onActivated: { addListener: (listener) => activated.push(listener) },
    onUpdated: { addListener: (listener) => updated.push(listener) },
  };
}

async function openPanel({ settings = GBP, client = undefined } = {}) {
  const { window } = new JSDOM(PANEL_HTML);
  const doc = window.document;
  const tabs = fakeTabs();
  const bus = fakeBus({
    answers: { [MSG.GET_ACTIVE_STATE]: { active: true, annotated: 3, unparsable: 1 } },
  });
  const store = fakeStore(settings);
  const rates = new RatesService(client ?? { fetch: async (base) => ratesOf(base) });
  const controller = new PanelController({ document: doc, tabs, bus, store, rates });
  const started = controller.start();
  const $ = (selector) => /** @type {any} */ (doc.querySelector(selector));
  return { window, doc, $, tabs, bus, store, controller, started };
}

const rateRows = ($) =>
  [...$("#rates").querySelectorAll("tr")].map((row) => row.textContent.replace(/\s+/g, " "));

test("shows the saved settings, the rates and the status on open", async () => {
  const { $, store, started } = await openPanel();
  await started;
  assert.deepEqual(
    [...$("#currency").options].map((option) => option.value),
    ["EUR", "USD", "GBP", "CHF"],
  );
  assert.equal($("#currency").value, "GBP");
  assert.equal($("#auction-premium").value, "20");
  assert.equal($("#shipment").value, "7");
  assert.equal($("#shipment-currency").textContent, "GBP");
  assert.equal($("#auction-premium").max, "100");
  assert.equal(rateRows($).length, 3);
  assert.match($("#rates-info").textContent, /2026-09-25/);
  assert.equal($("#status").textContent, "3 prices updated, 1 n/a");
  // The freshly loaded rates are saved for the content scripts.
  assert.deepEqual(store.savedRates, [ratesOf("GBP")]);
});

test("saves the entered settings with the matching rates in one go", async () => {
  const { window, $, store, bus, started } = await openPanel();
  await started;
  $("#auction-premium").value = "25";
  $("#shipment").value = "";
  $("#settings").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await settle();
  await settle();
  assert.deepEqual(store.saved, [
    {
      settings: new Settings({ auctionPremium: 25, shipment: 7, currency: "GBP" }),
      rates: ratesOf("GBP"),
    },
  ]);
  // The emptied input shows the kept value again.
  assert.equal($("#shipment").value, "7");
  assert.equal($("#saved").hidden, false);
  assert.equal(bus.sent.filter((message) => message.type === MSG.GET_ACTIVE_STATE).length, 2);
});

test("does not save invalid input", async () => {
  const { window, $, store, started } = await openPanel();
  await started;
  $("#auction-premium").value = "150";
  $("#settings").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await settle();
  assert.deepEqual(store.saved, []);
  assert.equal($("#auction-premium").classList.contains("is-invalid"), true);
});

test("only shows the rates of the currency picked last", async () => {
  const client = manualClient();
  const { window, $, started } = await openPanel({ client });
  client.answer(); // GBP, on open
  await started;

  $("#currency").value = "USD";
  $("#currency").dispatchEvent(new window.Event("change"));
  $("#currency").value = "CHF";
  $("#currency").dispatchEvent(new window.Event("change"));
  assert.equal($("#rates-info").textContent, "Loading…");

  client.answer(); // USD - superseded, must not show
  await settle();
  assert.equal($("#rates-info").textContent, "Loading…");
  client.answer(); // CHF
  await settle();
  assert.match(rateRows($)[0], /^1 CHF =/);
  assert.equal($("#shipment-currency").textContent, "CHF");
});

test("saves settings without rates when they could not be loaded", async () => {
  const client = manualClient();
  const { window, $, store, started } = await openPanel({ client });
  client.pending.shift().reject(new Error("offline"));
  await started;
  assert.equal($("#rates-info").textContent, "Exchange rates unavailable.");
  assert.equal($("#rates-info").classList.contains("text-danger"), true);

  $("#settings").dispatchEvent(new window.Event("submit", { cancelable: true }));
  await settle();
  await settle();
  assert.equal(store.saved.length, 1);
  assert.equal(store.saved[0].rates, undefined);
});

test("refreshes the status on state changes, tab switches and navigation", async () => {
  const { tabs, bus, started } = await openPanel();
  await started;
  const statusRequests = () =>
    bus.sent.filter((message) => message.type === MSG.GET_ACTIVE_STATE).length;
  const before = statusRequests();
  bus.deliver({ type: MSG.STATE_CHANGED });
  tabs.activated[0]({ tabId: 2 });
  tabs.updated[0](2, { status: "complete" });
  tabs.updated[0](2, { status: "loading" }); // not yet: ignored
  await settle();
  assert.equal(statusRequests(), before + 3);
});
