import { AuctionSite } from "./AuctionSite.js";
import { SiteRegistry } from "./SiteRegistry.js";

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
  }),
  new AuctionSite({
    origin: "https://www.numisbids.com",
    paths: ["/sale/*"],
    priceSelectors: [".rateclick"],
  }),
]);
