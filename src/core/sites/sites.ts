import { effectivePrice, type PriceCalculator } from "../pricing/PriceCalculator.ts";
import { globSource } from "../regexp.ts";

/**
 * Where a page URL names an ID: a query parameter (`{ query: "a" }` reads
 * `?a=7522`), or the path segment at `:id` in a path glob (`{ path: "/sale/:id*" }`
 * reads `/sale/7123/lot/45`; the rest of the glob must match the whole path).
 */
export type IdSource = { readonly query: string } | { readonly path: string };

/** The auction house and auction a URL names; null when not found. */
export type AuctionIds = { house: string | null; auction: string | null };

/** One auction site the extension acts on. See docs/configuration.md for the fields. */
export type AuctionSite = {
  /** protocol + host (optionally a port), no path; the build derives `<protocol>//<host>/*` */
  readonly origin: string;
  /** path globs ("*" = any characters); the site is active while the page path matches one */
  readonly paths: readonly string[];
  /** CSS selectors of the elements whose text holds a price */
  readonly priceSelectors: readonly string[];
  readonly calculator: PriceCalculator;
  /** where the URL names the auction house (optional) and the auction */
  readonly ids: { readonly house?: IdSource; readonly auction?: IdSource };
};

/** Marks the captured segment in an `IdSource` path. */
const PLACEHOLDER = ":id";

/**
 * A site with the defaults filled in: `effectivePrice` as calculator, no IDs.
 * @throws {Error} for an ID path without exactly one `:id`
 */
export function defineSite({
  calculator = effectivePrice,
  ids = {},
  ...site
}: Omit<AuctionSite, "calculator" | "ids"> &
  Partial<Pick<AuctionSite, "calculator" | "ids">>): AuctionSite {
  for (const source of Object.values(ids)) if ("path" in source) idPattern(source.path);
  return { ...site, calculator, ids };
}

/**
 * The first site whose origin equals the URL's and one of whose paths matches
 * its pathname (query and hash are ignored); null when there is none.
 */
export function findSite(
  sites: readonly AuctionSite[],
  url: string | undefined | null,
): AuctionSite | null {
  const parsed = parseUrl(url);
  if (!parsed) return null;
  return (
    sites.find(
      (site) =>
        parsed.origin === parseUrl(site.origin)?.origin &&
        site.paths.some((path) => new RegExp(`^${globSource(path)}$`).test(parsed.pathname)),
    ) ?? null
  );
}

/** The auction house and auction `url` names on `site`, as far as configured. */
export function identify(site: AuctionSite, url: string | undefined | null): AuctionIds {
  const parsed = parseUrl(url);
  const read = (source: IdSource | undefined) =>
    parsed && source ? extractId(source, parsed) : null;
  return { house: read(site.ids.house), auction: read(site.ids.auction) };
}

/**
 * The WebExtension match pattern of every page on `origin`'s host. Match
 * patterns cannot carry a port, so it is dropped; `findSite` still checks it.
 */
export function matchPatternFor(origin: string): string {
  const { protocol, hostname } = new URL(origin);
  return `${protocol}//${hostname}/*`;
}

/** The content script match patterns of `sites`, without duplicates. */
export function matchPatterns(sites: readonly AuctionSite[]): string[] {
  return [...new Set(sites.map((site) => matchPatternFor(site.origin)))];
}

function extractId(source: IdSource, url: URL): string | null {
  if ("query" in source) return url.searchParams.get(source.query) || null;
  const value = idPattern(source.path).exec(url.pathname)?.[1];
  if (value === undefined) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/** "/sale/:id*" -> /^\/sale\/([^/]+).*$/ */
function idPattern(path: string): RegExp {
  const [before, after, ...rest] = path.split(PLACEHOLDER);
  if (after === undefined || rest.length > 0) {
    throw new Error(`Path pattern "${path}" must contain ${PLACEHOLDER} exactly once`);
  }
  return new RegExp(`^${globSource(before ?? "")}([^/]+)${globSource(after)}$`);
}

function parseUrl(url: string | undefined | null): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}
