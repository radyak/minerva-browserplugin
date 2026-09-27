import { EffectivePriceCalculator } from "../pricing/EffectivePriceCalculator.js";
import { matchPatternFor, urlOnOrigin } from "./url-matcher.js";

/**
 * One auction site the extension acts on: where it is, which elements hold
 * the prices and how the price to show is worked out. Immutable.
 */
export class AuctionSite {
  /**
   * @param {object} config
   * @param {string} config.origin Protocol + host of the site, optionally with a port, no path
   *   (e.g. "https://www.biddr.com"). scripts/build.mjs turns it into the content script
   *   match pattern "<protocol>//<host>/*".
   * @param {string[]} config.paths Path globs on that host (e.g. "/live/*"). The extension only
   *   acts while the page path matches one of them; query and hash are ignored. "*" matches any
   *   run of characters, without it the path must match exactly.
   * @param {string[]} config.priceSelectors CSS selectors of the elements whose text content
   *   holds the price.
   * @param {import("../pricing/PriceCalculator.js").PriceCalculator} [config.calculator] How the
   *   price to show is worked out; the EffectivePriceCalculator unless the site's fees differ.
   */
  constructor({ origin, paths, priceSelectors, calculator = new EffectivePriceCalculator() }) {
    /** @readonly */
    this.origin = origin;
    /** @readonly */
    this.paths = Object.freeze([...paths]);
    /** @readonly */
    this.priceSelectors = Object.freeze([...priceSelectors]);
    /** @readonly */
    this.calculator = calculator;
    Object.freeze(this);
  }

  /**
   * Is `url` on this site's origin with a path matching one of `paths`?
   * @param {string | undefined | null} url
   * @returns {boolean}
   */
  matches(url) {
    return urlOnOrigin(url, this.origin, this.paths);
  }

  /** The WebExtension match pattern covering every page of this site's host. */
  get matchPattern() {
    return matchPatternFor(this.origin);
  }
}
