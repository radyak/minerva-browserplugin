/**
 * Glob matching for URLs - deliberately tiny, no dependency, no match-pattern
 * semantics. "*" stands for any run of characters, everything else is literal.
 */

const ESCAPE_RE = /[.+?^${}()|[\]\\]/g;

/** Compile a glob such as "https://example.com/app/*" into a RegExp. */
export function globToRegExp(pattern) {
  const source = pattern
    .replace(ESCAPE_RE, "\\$&")
    .split("*")
    .join(".*");
  return new RegExp(`^${source}$`);
}

/**
 * @param {string | undefined | null} url
 * @param {string} pattern
 * @returns {boolean}
 */
export function urlMatches(url, pattern) {
  if (typeof url !== "string" || url.length === 0) return false;
  return globToRegExp(pattern).test(url);
}

/**
 * Parse a URL without throwing.
 * @param {string | undefined | null} url
 * @returns {URL | null}
 */
function parseUrl(url) {
  if (typeof url !== "string" || url.length === 0) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * WebExtension match pattern covering every page of a platform URL
 * ("https://www.biddr.com" -> "https://www.biddr.com/*"). Match patterns cannot
 * carry a port, so it is dropped here; `urlOnPlatform` still checks it.
 * @param {string} platformUrl protocol + host, optionally with port
 * @returns {string}
 */
export function matchPatternFor(platformUrl) {
  const { protocol, hostname } = new URL(platformUrl);
  return `${protocol}//${hostname}/*`;
}

/**
 * Is `url` on the origin of `platformUrl` with a path matching one of the
 * globs in `pathPatterns`? Only the pathname is matched; query and hash are
 * ignored.
 * @param {string | undefined | null} url
 * @param {string} platformUrl protocol + host, optionally with port
 * @param {string[]} pathPatterns path globs such as "/live/*"
 * @returns {boolean}
 */
export function urlOnPlatform(url, platformUrl, pathPatterns) {
  const parsed = parseUrl(url);
  if (!parsed || parsed.origin !== parseUrl(platformUrl)?.origin) return false;
  return pathPatterns.some((pattern) => urlMatches(parsed.pathname, pattern));
}
