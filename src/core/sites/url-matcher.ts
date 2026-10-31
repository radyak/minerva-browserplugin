/**
 * Glob matching for URLs - deliberately tiny, no dependency, no match-pattern
 * semantics. "*" stands for any run of characters, everything else is literal.
 */

const ESCAPE_RE = /[.+?^${}()|[\]\\]/g;

/** Compile a glob such as "https://example.com/app/*" into a RegExp. */
export function globToRegExp(pattern: string): RegExp {
  const source = pattern.replace(ESCAPE_RE, "\\$&").split("*").join(".*");
  return new RegExp(`^${source}$`);
}

export function urlMatches(url: string | undefined | null, pattern: string): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  return globToRegExp(pattern).test(url);
}

/**
 * Parse a URL without throwing.
 */
function parseUrl(url: string | undefined | null): URL | null {
  if (typeof url !== "string" || url.length === 0) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * WebExtension match pattern covering every page of a site origin
 * ("https://www.biddr.com" -> "https://www.biddr.com/*"). Match patterns cannot
 * carry a port, so it is dropped here; `urlOnOrigin` still checks it.
 * @param origin protocol + host, optionally with port
 */
export function matchPatternFor(origin: string): string {
  const { protocol, hostname } = new URL(origin);
  return `${protocol}//${hostname}/*`;
}

/**
 * Is `url` on `origin` with a path matching one of the
 * globs in `pathPatterns`? Only the pathname is matched; query and hash are
 * ignored.
 * @param origin protocol + host, optionally with port
 * @param pathPatterns path globs such as "/live/*"
 */
export function urlOnOrigin(
  url: string | undefined | null,
  origin: string,
  pathPatterns: readonly string[],
): boolean {
  const parsed = parseUrl(url);
  if (!parsed || parsed.origin !== parseUrl(origin)?.origin) return false;
  return pathPatterns.some((pattern) => urlMatches(parsed.pathname, pattern));
}
