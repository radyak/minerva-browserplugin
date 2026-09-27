import assert from "node:assert/strict";
import test from "node:test";
import { JSDOM } from "jsdom";

import { ContentController } from "../src/content/ContentController.js";
import { ANNOTATION_CLASS } from "../src/core/config.js";
import { MSG } from "../src/core/messages.js";
import { ExchangeRates } from "../src/core/rates/ExchangeRates.js";
import { PriceCalculator } from "../src/core/pricing/PriceCalculator.js";
import { Settings } from "../src/core/settings/Settings.js";
import { AuctionSite } from "../src/core/sites/AuctionSite.js";
import { SiteRegistry } from "../src/core/sites/SiteRegistry.js";
import { fakeBus, fakeStore, settle } from "./support/fakes.mjs";

const SITES = new SiteRegistry([
  new AuctionSite({ origin: "https://shop.test", paths: ["/lot/*"], priceSelectors: [".price"] }),
  new AuctionSite({ origin: "https://other.test", paths: ["/*"], priceSelectors: [".other"] }),
]);
const EUR = new Settings({ auctionPremium: 20, shipment: 10, currency: "EUR" });
const INTO_EUR = new ExchangeRates("EUR", "", { USD: 2 });

/** A page with one price, a controller on it and its fakes. */
async function startOn(url, { price = "500 USD", settings = EUR, rates = INTO_EUR } = {}) {
  const { window } = new JSDOM(`<span class="price">${price}</span><b class="other">999 EUR</b>`, {
    url,
    pretendToBeVisual: true, // requestAnimationFrame
  });
  const bus = fakeBus();
  const store = fakeStore(settings, rates);
  const controller = new ContentController({
    window: /** @type {any} */ (window),
    bus,
    store,
    sites: SITES,
  });
  await controller.start();
  const annotation = () => window.document.querySelector(`.${ANNOTATION_CLASS}`)?.textContent;
  return { window, bus, store, controller, annotation };
}

const nextFrame = (window) => new Promise((resolve) => window.requestAnimationFrame(resolve));

test("annotates on start and reports the state once", async () => {
  const { bus, annotation } = await startOn("https://shop.test/lot/1");
  // 500 USD -> 250 EUR, +20 % -> 300, +10 shipment.
  assert.equal(annotation(), "310 EUR");
  assert.deepEqual(bus.sent, [
    {
      type: MSG.STATE_CHANGED,
      url: "https://shop.test/lot/1",
      active: true,
      annotated: 1,
      unparsable: 0,
      reason: "load",
    },
  ]);
});

test("stays inactive off the configured sites", async () => {
  const { bus, annotation } = await startOn("https://shop.test/account");
  assert.equal(annotation(), undefined);
  assert.equal(bus.sent[0].active, false);
});

test("answers a sync request with the current state, after re-reading the settings", async () => {
  const { bus, store, annotation } = await startOn("https://shop.test/lot/1");
  await store.change(new Settings({ auctionPremium: 0, shipment: 0, currency: "EUR" }), INTO_EUR);
  assert.deepEqual(await bus.deliver({ type: MSG.SYNC_REQUEST }), {
    url: "https://shop.test/lot/1",
    active: true,
    annotated: 1,
    unparsable: 0,
  });
  assert.equal(annotation(), "250 EUR");
});

test("recalculates when the settings change", async () => {
  const { store, annotation } = await startOn("https://shop.test/lot/1");
  await store.change(new Settings({ auctionPremium: 0, shipment: 5, currency: "EUR" }), INTO_EUR);
  assert.equal(annotation(), "255 EUR");
});

test("shows n/a when the new currency has no rates yet", async () => {
  const { bus, store, annotation } = await startOn("https://shop.test/lot/1");
  await store.change(new Settings({ auctionPremium: 0, shipment: 0, currency: "GBP" }));
  assert.equal(annotation(), "n/a");
  assert.equal(bus.sent.at(-1).unparsable, 1);
});

test("follows prices the page changes, once per animation frame", async () => {
  const { window, bus, annotation } = await startOn("https://shop.test/lot/1");
  window.document.querySelector(".price").textContent = "100 USD";
  window.document.querySelector(".price").textContent = "200 USD";
  await nextFrame(window);
  await nextFrame(window);
  assert.equal(annotation(), "130 EUR");
  // Same number of annotated prices: nothing new to report.
  assert.equal(bus.sent.length, 1);
});

test("re-evaluates on in-page navigation", async () => {
  const { window, bus, annotation } = await startOn("https://shop.test/lot/1");
  window.history.pushState({}, "", "/account");
  window.dispatchEvent(new window.PopStateEvent("popstate"));
  assert.equal(annotation(), undefined);
  assert.deepEqual(
    bus.sent.map((message) => [message.reason, message.active]),
    [
      ["load", true],
      ["popstate", false],
    ],
  );
  await settle();
});

test("uses the price selectors of the matching site", async () => {
  const { window, annotation } = await startOn("https://other.test/");
  // Only `.other` is a price on this site: 999 EUR +20 % +10.
  assert.equal(annotation(), "1208.80 EUR");
  assert.equal(window.document.querySelector(".price").nextElementSibling.className, "other");
});

test("cleans up what an earlier run left behind off the sites", async () => {
  const { window, controller, annotation } = await startOn("https://shop.test/lot/1");
  assert.equal(annotation(), "310 EUR");
  window.history.pushState({}, "", "/account");
  assert.equal(controller.sync("test").active, false);
  assert.equal(annotation(), undefined);
});

test("each site uses its own calculator", async () => {
  class Flat extends PriceCalculator {
    calculate() {
      return 42;
    }
  }
  const sites = new SiteRegistry([
    new AuctionSite({ origin: "https://shop.test", paths: ["/*"], priceSelectors: [".price"] }),
    new AuctionSite({
      origin: "https://flat.test",
      paths: ["/*"],
      priceSelectors: [".price"],
      calculator: new Flat(),
    }),
  ]);
  const annotationOn = async (url) => {
    const { window } = new JSDOM(`<span class="price">500 USD</span>`, { url });
    await new ContentController({
      window: /** @type {any} */ (window),
      bus: fakeBus(),
      store: fakeStore(EUR, INTO_EUR),
      sites,
    }).start();
    return window.document.querySelector(`.${ANNOTATION_CLASS}`)?.textContent;
  };
  assert.equal(await annotationOn("https://shop.test/lot/1"), "310 EUR");
  assert.equal(await annotationOn("https://flat.test/lot/1"), "42 EUR");
});
