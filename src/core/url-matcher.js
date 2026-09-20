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
