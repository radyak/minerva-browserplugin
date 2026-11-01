import { AuctionKey } from "../settings/AuctionKey.ts";
import { findSite, identify, type AuctionSite } from "../sites/sites.ts";

/**
 * What the extension is doing in one tab: whether it is active there, how
 * many prices it annotated (`unparsable` of them without a result), in which
 * currencies those prices were, and which auction (an AuctionKey) the page is
 * about. Content script, background and panel all speak about a tab in these
 * terms. Plain data, so it is its own message format.
 */
export type TabState = AuctionKey & {
  readonly active: boolean;
  readonly annotated: number;
  readonly unparsable: number;
  /** currency codes of the prices on the page, sorted, without duplicates */
  readonly currencies: readonly string[];
};

const count = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;

export const TabState = {
  /** A state with everything not given inactive / zero / none / unknown. */
  of({
    currencies = [],
    ...values
  }: Partial<Omit<TabState, "currencies">> & { currencies?: Iterable<string> } = {}): TabState {
    return {
      active: values.active ?? false,
      annotated: values.annotated ?? 0,
      unparsable: values.unparsable ?? 0,
      currencies: [...new Set(currencies)].sort(),
      site: values.site ?? null,
      house: values.house ?? null,
      auction: values.auction ?? null,
    };
  },

  /** Not active: nothing annotated. */
  inactive(): TabState {
    return TabState.of();
  },

  /**
   * The state in a message; anything missing or of the wrong type counts as
   * inactive / zero / no currencies / unknown.
   */
  from(data: unknown): TabState {
    const values = (data ?? {}) as { [field in keyof TabState]?: unknown };
    return TabState.of({
      ...AuctionKey.from(values),
      active: values.active === true,
      annotated: count(values.annotated),
      unparsable: count(values.unparsable),
      currencies: Array.isArray(values.currencies)
        ? values.currencies.filter((code): code is string => typeof code === "string")
        : [],
    });
  },

  /**
   * The state of a tab judged by its URL alone, for tabs without a content
   * script (yet): active on a site, with the IDs its URL names.
   */
  forUrl(sites: readonly AuctionSite[], url: string | undefined | null): TabState {
    const site = findSite(sites, url);
    if (!site) return TabState.inactive();
    return TabState.of({ active: true, site: site.origin, ...identify(site, url) });
  },

  equals(a: TabState, b: TabState | null | undefined): boolean {
    return (
      b != null &&
      AuctionKey.equals(a, b) &&
      a.active === b.active &&
      a.annotated === b.annotated &&
      a.unparsable === b.unparsable &&
      a.currencies.length === b.currencies.length &&
      a.currencies.every((code, i) => code === b.currencies[i])
    );
  },

  /**
   * Whether the tab is on an actual auction: active, and the URL names the
   * auction house or the auction. Only then does the panel offer the settings.
   */
  onAuction(state: TabState): boolean {
    return state.active && (state.house !== null || state.auction !== null);
  },
};
