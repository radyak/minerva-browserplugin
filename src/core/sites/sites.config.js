import { AuctionSite } from "./AuctionSite.js";
import { SiteRegistry } from "./SiteRegistry.js";
import { UrlParam } from "./UrlParam.js";

/**
 * Every auction site the extension acts on - the one place to edit when the
 * targets change. Both the manifests (build time, via `matchPatterns()`) and
 * the runtime code read from here. See AuctionSite for the fields.
 */
export const SITES = new SiteRegistry([
  new AuctionSite({
    origin: "https://www.biddr.com",
    paths: ["/*"],
    // The value is the second div of <div class="lot-price"><div>label</div><div>value</div>.
    // Running lots wrap the price in its own span, followed by the bid count:
    //   <div><span class="a-cb-9335202">1 EUR</span> (<span class="a-cbts-9335202">1</span>)</div>
    // Finished ones write it straight into the div: <div>340 EUR (<span class="a-cbts-…">14</span>)</div>
    // Both selectors match a running lot; only the inner span is annotated then.
    // Not div:last-child: the annotation inserted after the div would take that place.
    priceSelectors: [
      ".current-bid",
      '.lot-price > div:nth-child(2) > span[class^="a-cb-"]',
      ".lot-price > div:nth-child(2)",
    ],
    // https://www.biddr.com/agorawien/auction?a=7522&l=9222559
    ids: { house: UrlParam.path("/:id/auction"), auction: UrlParam.query("a") },
  }),
  new AuctionSite({
    origin: "https://www.numisbids.com",
    paths: ["/sale/*"],
    priceSelectors: [".rateclick"],
    // https://www.numisbids.com/sale/7123 and /sale/7123/lot/45; the house is not in the URL.
    ids: { auction: UrlParam.path("/sale/:id*") },
  }),
]);
