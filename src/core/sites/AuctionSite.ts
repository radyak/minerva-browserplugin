import { EffectivePriceCalculator } from "../pricing/EffectivePriceCalculator.ts";
import { matchPatternFor, urlOnOrigin } from "./url-matcher.ts";
import type { PriceCalculator } from "../pricing/PriceCalculator.ts";
import type { UrlParam } from "./UrlParam.ts";

/** The auction house and auction a URL names; null when not found. */
export type AuctionIds = { house: string | null; auction: string | null };

/**
 * One auction site the extension acts on: where it is, which elements hold
 * the prices, how the price to show is worked out and where the URL names the
 * auction house and the auction. Immutable.
 */
export class AuctionSite {
  readonly origin: string;
  readonly paths: readonly string[];
  readonly priceSelectors: readonly string[];
  readonly calculator: PriceCalculator;
  readonly ids: Readonly<{ house: UrlParam | null; auction: UrlParam | null }>;

  /**
   * @param config.origin Protocol + host of the site, optionally with a port, no path
   *   (e.g. "https://www.biddr.com"). The build (wxt.config.ts) turns it into the content script
   *   match pattern "<protocol>//<host>/*".
   * @param config.paths Path globs on that host (e.g. "/live/*"). The extension only
   *   acts while the page path matches one of them; query and hash are ignored. "*" matches any
   *   run of characters, without it the path must match exactly.
   * @param config.priceSelectors CSS selectors of the elements whose text content
   *   holds the price.
   * @param config.calculator How the price to show is worked out; the
   *   EffectivePriceCalculator unless the site's fees differ.
   * @param config.ids Where the page URL names the auction, see UrlParam.
   * @param config.ids.house the auction house (optional: not every site has it
   *   in the URL)
   * @param config.ids.auction the auction
   */
  constructor({
    origin,
    paths,
    priceSelectors,
    calculator = new EffectivePriceCalculator(),
    ids = {},
  }: {
    origin: string;
    paths: readonly string[];
    priceSelectors: readonly string[];
    calculator?: PriceCalculator;
    ids?: { house?: UrlParam; auction?: UrlParam };
  }) {
    this.origin = origin;
    this.paths = Object.freeze([...paths]);
    this.priceSelectors = Object.freeze([...priceSelectors]);
    this.calculator = calculator;
    this.ids = Object.freeze({ house: ids.house ?? null, auction: ids.auction ?? null });
    Object.freeze(this);
  }

  /**
   * Is `url` on this site's origin with a path matching one of `paths`?
   */
  matches(url: string | undefined | null): boolean {
    return urlOnOrigin(url, this.origin, this.paths);
  }

  /**
   * The auction house and auction `url` is about, as far as the URL tells.
   * @returns null for each one not found (or not configured)
   */
  identify(url: string | undefined | null): AuctionIds {
    let parsed: URL;
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
  get matchPattern(): string {
    return matchPatternFor(this.origin);
  }
}
