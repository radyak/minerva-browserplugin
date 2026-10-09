/**
 * Reads one identifier (auction house, auction) out of a page URL: either a
 * query parameter or a segment of the path. Immutable.
 *
 * - `UrlParam.query("a")`: the value of `?a=…`
 * - `UrlParam.path("/:id/auction")`: the path segment at `:id`; the rest of the
 *   pattern is a glob like AuctionSite's `paths` ("*" = any characters, the
 *   rest literal) and must match the whole path.
 */
export class UrlParam {
  /** Placeholder for the captured path segment in `path()` patterns. */
  static PLACEHOLDER = ":id";

  /**
   * @param {"query" | "path"} kind
   * @param {string} source query parameter name or path pattern
   */
  constructor(kind, source) {
    /** @readonly */
    this.kind = kind;
    /** @readonly */
    this.source = source;
    /** @type {RegExp | null} */
    const pattern = kind === "path" ? compilePathPattern(source) : null;
    /** @readonly */
    this.pattern = pattern;
    Object.freeze(this);
  }

  /**
   * The value of the query parameter `name`.
   * @param {string} name
   */
  static query(name) {
    return new UrlParam("query", name);
  }

  /**
   * The path segment at `:id` in `pattern`, e.g. "/sale/:id*".
   * @param {string} pattern path glob holding `:id` exactly once
   */
  static path(pattern) {
    return new UrlParam("path", pattern);
  }

  /**
   * The identifier in `url`, or null when it is not there (or empty).
   * @param {URL} url
   * @returns {string | null}
   */
  extract(url) {
    if (this.kind === "query") return url.searchParams.get(this.source) || null;
    const match = this.pattern?.exec(url.pathname);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
}

/**
 * "/sale/:id*" -> /^\/sale\/([^/]+).*$/
 * @param {string} pattern
 * @returns {RegExp}
 */
function compilePathPattern(pattern) {
  const parts = pattern.split(UrlParam.PLACEHOLDER);
  if (parts.length !== 2) {
    throw new Error(`Path pattern "${pattern}" must contain ${UrlParam.PLACEHOLDER} exactly once`);
  }
  const glob = (part) =>
    part
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .split("*")
      .join(".*");
  return new RegExp(`^${glob(parts[0])}([^/]+)${glob(parts[1])}$`);
}
