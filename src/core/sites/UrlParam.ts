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
  readonly kind: "query" | "path";
  readonly source: string;
  readonly pattern: RegExp | null;

  /**
   * @param source query parameter name or path pattern
   */
  constructor(kind: "query" | "path", source: string) {
    this.kind = kind;
    this.source = source;

    this.pattern = kind === "path" ? compilePathPattern(source) : null;
    Object.freeze(this);
  }

  /**
   * The value of the query parameter `name`.
   */
  static query(name: string): UrlParam {
    return new UrlParam("query", name);
  }

  /**
   * The path segment at `:id` in `pattern`, e.g. "/sale/:id*".
   * @param pattern path glob holding `:id` exactly once
   */
  static path(pattern: string): UrlParam {
    return new UrlParam("path", pattern);
  }

  /**
   * The identifier in `url`, or null when it is not there (or empty).
   */
  extract(url: URL): string | null {
    if (this.kind === "query") return url.searchParams.get(this.source) || null;
    const match = this.pattern?.exec(url.pathname);
    const value = match?.[1];
    if (value === undefined) return null;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
}

/**
 * "/sale/:id*" -> /^\/sale\/([^/]+).*$/
 */
function compilePathPattern(pattern: string): RegExp {
  const parts = pattern.split(UrlParam.PLACEHOLDER);
  if (parts.length !== 2) {
    throw new Error(`Path pattern "${pattern}" must contain ${UrlParam.PLACEHOLDER} exactly once`);
  }
  const glob = (part = "") =>
    part
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .split("*")
      .join(".*");
  return new RegExp(`^${glob(parts[0])}([^/]+)${glob(parts[1])}$`);
}
