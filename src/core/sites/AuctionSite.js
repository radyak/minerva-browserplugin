import { EffectivePriceCalculator } from "../pricing/EffectivePriceCalculator.js";
import { matchPatternFor, urlOnOrigin } from "./url-matcher.js";

/** @typedef {{house: string | null, auction: string | null}} AuctionIds */

/**
 * One auction site the extension acts on: where it is, which elements hold
 * the prices, how the price to show is worked out and where the URL names the
 * auction house and the auction. Immutable.
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
   * @param {object} [config.ids] Where the page URL names the auction, see UrlParam.
   * @param {import("./UrlParam.js").UrlParam} [config.ids.house] the auction house (optional:
   *   not every site has it in the URL)
   * @param {import("./UrlParam.js").UrlParam} [config.ids.auction] the auction
   */
  constructor({
    origin,
    paths,
    priceSelectors,
    calculator = new EffectivePriceCalculator(),
    ids = {},
  }) {
    /** @readonly */
    this.origin = origin;
    /** @readonly */
    this.paths = Object.freeze([...paths]);
    /** @readonly */
    this.priceSelectors = Object.freeze([...priceSelectors]);
    /** @readonly */
    this.calculator = calculator;
    /** @readonly */
    this.ids = Object.freeze({ house: ids.house ?? null, auction: ids.auction ?? null });
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

  /**
   * The auction house and auction `url` is about, as far as the URL tells.
   * @param {string | undefined | null} url
   * @returns {AuctionIds} null for each one not found (or not configured)
   */
  identify(url) {
    let parsed;
    try {
      parsed = new URL(url ?? "");
    } catch {
      return { house: null, auction: null };
    }
    return {
      house: this.ids.house?.extract(parsed) ?? null,
      auction: this.ids.auction?.extract(parsed) ?? null,
    };
  }

  /** The WebExtension match pattern covering every page of this site's host. */
  get matchPattern() {
    return matchPatternFor(this.origin);
  }
}
