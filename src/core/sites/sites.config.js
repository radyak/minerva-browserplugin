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
    priceSelectors: [".current-bid", ".lot-price div:last-child span:first-child"],
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
