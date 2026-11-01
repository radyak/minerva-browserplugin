import { UNPARSABLE_TEXT } from "../config.ts";
import { convertPrice } from "../price.ts";
import { TabState } from "../state/TabState.ts";
import { AnnotationView } from "./AnnotationView.ts";
import type { ExchangeRates } from "../rates/ExchangeRates.ts";
import type { BuyerCosts } from "../settings/BuyerCosts.ts";
import type { Settings } from "../settings/Settings.ts";
import type { AuctionSite } from "../sites/sites.ts";

/**
 * Reads the price out of every price element of a document, works out the
 * effective price and has the AnnotationView show it next to the element.
 * Browser agnostic: works against a plain Document.
 */
export class PriceAnnotator {
  view: AnnotationView;
  constructor(doc: Document) {
    this.view = new AnnotationView(doc);
  }

  /**
   * Insert or refresh the price worked out by `site.calculator` next to every
   * element matching `site.priceSelectors`. An element whose text holds no
   * parsable price - or one in a currency that is unknown or has no rate -
   * still gets its sibling, showing UNPARSABLE_TEXT instead of an amount.
   * Annotations of elements that are not annotated any more are removed, so
   * the page never keeps a stale amount.
   * @param rates base `settings.currency`
   * @param buyer the buyer's own costs; none when omitted
   * @returns active, with the counts and price currencies after the run
   */
  annotate(
    site: AuctionSite,
    settings: Settings,
    rates: ExchangeRates,
    buyer?: BuyerCosts,
  ): TabState {
    let annotated = 0;
    let unparsable = 0;

    const currencies: Set<string> = new Set();

    const matches = this.view.query(site.priceSelectors);
    const wrappers = findWrappers(matches);
    const shown = matches.filter((element) => !wrappers.has(element));
    for (const element of shown) {
      const source = this.view.priceText(element);
      const converted = convertPrice(
        source,
        (amount, currency) => {
          if (currency) currencies.add(currency);
          return site.calculator(amount, currency, settings, rates, buyer);
        },
        settings.currency,
      );
      this.view.show(element, {
        text: converted ?? UNPARSABLE_TEXT,
        source,
        unresolved: converted === null,
      });

      annotated += 1;
      if (converted === null) unparsable += 1;
    }
    this.view.removeAllBut(shown);

    return TabState.of({ active: true, annotated, unparsable, currencies });
  }

  /**
   * Remove every annotation, e.g. after navigating away from a site.
   * @returns inactive
   */
  clear(): TabState {
    this.view.clear();
    return TabState.inactive();
  }
}

/**
 * The matches that wrap another match. Only the innermost element holds the
 * price itself; annotating the wrapper too would show the price twice (and
 * read the inner annotation back as part of its text).
 */
function findWrappers(matches: Element[]): Set<Element> {
  const matched = new Set(matches);
  const wrappers = new Set<Element>();
  for (const element of matches) {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (matched.has(parent)) wrappers.add(parent);
    }
  }
  return wrappers;
}
