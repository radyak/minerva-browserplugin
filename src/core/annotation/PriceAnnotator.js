import { UNPARSABLE_TEXT } from "../config.js";
import { convertPrice } from "../price.js";
import { TabState } from "../state/TabState.js";
import { AnnotationView } from "./AnnotationView.js";

/**
 * Reads the price out of every price element of a document, works out the
 * effective price and has the AnnotationView show it next to the element.
 * Browser agnostic: works against a plain Document.
 */
export class PriceAnnotator {
  /** @param {Document} doc */
  constructor(doc) {
    this.view = new AnnotationView(doc);
  }

  /**
   * Insert or refresh the price worked out by `site.calculator` next to every
   * element matching `site.priceSelectors`. An element whose text holds no
   * parsable price - or one in a currency that is unknown or has no rate -
   * still gets its sibling, showing UNPARSABLE_TEXT instead of an amount.
   * @param {import("../sites/AuctionSite.js").AuctionSite} site
   * @param {import("../settings/Settings.js").Settings} settings
   * @param {import("../rates/ExchangeRates.js").ExchangeRates} rates base `settings.currency`
   * @returns {TabState} active, with the counts after the run
   */
  annotate(site, settings, rates) {
    let annotated = 0;
    let unparsable = 0;

    const matches = this.view.query(site.priceSelectors);
    const wrappers = findWrappers(matches);
    for (const element of matches) {
      if (wrappers.has(element)) {
        // Drop what an earlier run may have put next to it.
        this.view.removeFrom(element);
        continue;
      }

      const source = this.view.priceText(element);
      const converted = convertPrice(
        source,
        (amount, currency) => site.calculator.calculate(amount, currency, settings, rates),
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

    return new TabState({ active: true, annotated, unparsable });
  }

  /**
   * Remove every annotation, e.g. after navigating away from a site.
   * @returns {TabState} inactive
   */
  clear() {
    this.view.clear();
    return TabState.inactive();
  }
}

/**
 * The matches that wrap another match. Only the innermost element holds the
 * price itself; annotating the wrapper too would show the price twice (and
 * read the inner annotation back as part of its text).
 * @param {Element[]} matches
 * @returns {Set<Element>}
 */
function findWrappers(matches) {
  const matched = new Set(matches);
  const wrappers = new Set();
  for (const element of matches) {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      if (matched.has(parent)) wrappers.add(parent);
    }
  }
  return wrappers;
}
