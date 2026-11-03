import assert from "node:assert/strict";
import { test } from "vitest";
import { JSDOM } from "jsdom";

import { ContentController } from "../src/content/ContentController.ts";
import { ANNOTATION_CLASS, POPUP_CLASS } from "../src/core/config.ts";
import { MSG } from "../src/core/messages.ts";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.ts";
import { BuyerCosts } from "../src/core/settings/BuyerCosts.ts";
import { Settings } from "../src/core/settings/Settings.ts";
import { defineSite } from "../src/core/sites/sites.ts";
import { bookOf, fakeBus, fakeStore, settle } from "./support/fakes.ts";

const SHOP = "https://shop.test";
const SITES = [
  defineSite({
    origin: SHOP,
    paths: ["/lot/*"],
    // "div" would match the pop-up's own parts as well: they must never be annotated.
    priceSelectors: [".price", "div"],
    ids: { auction: { path: "/lot/:id" } },
  }),
];
const EUR = new Settings({ auctionPremium: 20, shipment: 10, currency: "EUR" });
const INTO_EUR = new ExchangeRates("EUR", "", { USD: 2 });
const KEY = { site: SHOP, house: null, auction: "1" };

/** A page with two prices, one of them inside a link, and a controller on it. */
async function startOn(url = `${SHOP}/lot/1`) {
  const { window } = new JSDOM(
    `<span class="price">500 USD</span><a href="/elsewhere"><span class="price">100 EUR</span></a>`,
    { url, pretendToBeVisual: true },
  );
  const bus = fakeBus();
  const store = fakeStore({ book: bookOf([{ site: SHOP }, EUR]), rates: [INTO_EUR] });
  const controller = new ContentController({ window: window as any, bus, store, sites: SITES });
  await controller.start();
  const doc = window.document;
  const annotations = () => [...doc.querySelectorAll<HTMLElement>(`.${ANNOTATION_CLASS}`)];
  const popups = () => doc.querySelectorAll(`.${POPUP_CLASS}`);
  /** The pop-up's rows as "label | amount", or its message. */
  const shown = () => {
    const popup = doc.querySelector(`.${POPUP_CLASS}`);
    if (!popup) return null;
    const rows = [...popup.querySelectorAll(`.${POPUP_CLASS}-row`)];
    return rows.length
      ? rows.map((row) => [...row.children].map((cell) => cell.textContent).join(" | "))
      : popup.querySelector(`.${POPUP_CLASS}-message`)!.textContent;
  };
  const note = () => doc.querySelector(`.${POPUP_CLASS}-note`)?.textContent ?? null;
  /** Click `element` the way a user would; returns whether the page's default went ahead. */
  const click = (element: Element) =>
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  return { window, doc, bus, store, controller, annotations, popups, shown, note, click };
}

test("opens a pop-up explaining the price of the clicked annotation", async () => {
  const { annotations, popups, shown, click } = await startOn();
  assert.equal(popups().length, 0);
  click(annotations()[0]!);
  assert.equal(popups().length, 1);
  // 500 USD + 20 % + 10 USD shipment = 610 USD = 305 EUR.
  assert.deepEqual(shown(), [
    "Hammer price | 500 USD",
    "+ Premium 20 % | 100 USD",
    "+ Shipment 10 | 10 USD",
    "= Invoice share | 610 USD",
    "= In EUR (1 USD = 0.5 EUR) | 305 EUR",
    "= Effective price | 305 EUR",
  ]);
});

test("positions the pop-up with !important, which content.css's reset would beat otherwise", async () => {
  const { doc, annotations, click } = await startOn();
  click(annotations()[0]!);
  const { style } = doc.querySelector<HTMLElement>(`.${POPUP_CLASS}`)!;
  for (const name of ["top", "left"]) {
    assert.match(style.getPropertyValue(name), /^-?\d+px$/);
    assert.equal(style.getPropertyPriority(name), "important");
  }
});

test("never annotates the pop-up, even when a price selector matches its parts", async () => {
  const { controller, annotations, click } = await startOn();
  click(annotations()[0]!);
  controller.sync("test");
  assert.equal(annotations().length, 2);
});

test("keeps a single pop-up, moving it to the annotation clicked last", async () => {
  const { annotations, popups, shown, click } = await startOn();
  click(annotations()[0]!);
  // The annotation inside a link opens the pop-up instead of following the link.
  assert.equal(click(annotations()[1]!), false);
  assert.equal(popups().length, 1);
  assert.equal((shown() as string[])[0], "Hammer price | 100 EUR");

  // Clicked again, the annotation it is open for closes it.
  click(annotations()[1]!);
  assert.equal(popups().length, 0);
});

test("closes with its close button and with Escape, opens with Enter", async () => {
  const { window, doc, annotations, popups, click } = await startOn();
  click(annotations()[0]!);
  click(doc.querySelector(`.${POPUP_CLASS} button[aria-label="Close"]`)!);
  assert.equal(popups().length, 0);

  const key = (target: Element, name: string) =>
    target.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
    );
  key(annotations()[0]!, "Enter");
  assert.equal(popups().length, 1);
  key(doc.body, "Escape");
  assert.equal(popups().length, 0);
});

test("shows the panel's unsaved values for this auction, without touching the prices", async () => {
  const { bus, annotations, shown, note, click } = await startOn();
  click(annotations()[0]!);
  const preview = (settings: Settings, key: object = KEY) =>
    bus.deliver({
      type: MSG.PREVIEW,
      preview: {
        key,
        settings: settings.toJSON(),
        buyer: new BuyerCosts({ enabled: true, importVat: 10, paymentCosts: 0, flatFees: 0 }),
        rates: null,
      },
    });

  preview(new Settings({ auctionPremium: 0, shipment: 0, currency: "EUR" }));
  assert.deepEqual(shown(), [
    "Hammer price | 500 USD",
    "= Invoice share | 500 USD",
    "= In EUR (1 USD = 0.5 EUR) | 250 EUR",
    "+ Import VAT 10 % | 25 EUR",
    "= Effective price | 275 EUR",
  ]);
  assert.equal(note(), "With the unsaved values from the side panel.");
  assert.equal(annotations()[0]!.textContent, "305 EUR"); // still the saved values

  // Nothing unsaved any more: the saved values again.
  bus.deliver({ type: MSG.PREVIEW, preview: null });
  assert.equal((shown() as string[]).at(-1), "= Effective price | 305 EUR");
  assert.equal(note(), null);

  // Values entered for another auction do not apply here.
  preview(EUR, { ...KEY, auction: "2" });
  assert.equal((shown() as string[]).at(-1), "= Effective price | 305 EUR");
  assert.equal(note(), null);
});

test("follows saved settings and closes once its annotation is gone", async () => {
  const { doc, store, controller, annotations, popups, shown, click } = await startOn();
  click(annotations()[0]!);
  await store.change({
    book: bookOf([
      { site: SHOP },
      new Settings({ auctionPremium: 0, shipment: 0, currency: "EUR" }),
    ]),
  });
  await settle();
  assert.equal((shown() as string[]).at(-1), "= Effective price | 250 EUR");

  doc.querySelector(".price")!.remove();
  controller.sync("test");
  assert.equal(popups().length, 0);
});

test("explains why a price has no result", async () => {
  const { doc, controller, annotations, shown, click } = await startOn();
  doc.querySelector(".price")!.textContent = "500 GBP";
  controller.sync("test");
  click(annotations()[0]!);
  assert.equal(shown(), "No exchange rate from GBP into EUR.");
});

test("removes the pop-up and stops listening when stopped", async () => {
  const { controller, annotations, popups, click } = await startOn();
  const annotation = annotations()[0]!;
  click(annotation);
  controller.stop();
  assert.equal(popups().length, 0);
  click(annotation);
  assert.equal(popups().length, 0);
});
