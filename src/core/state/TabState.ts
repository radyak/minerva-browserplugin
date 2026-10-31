/** `TabState#toJSON()`, what messages carry. */
export type TabStateJSON = {
  active: boolean;
  annotated: number;
  unparsable: number;
  currencies: string[];
  site: string | null;
  house: string | null;
  auction: string | null;
};

/**
 * What the extension is doing in one tab: whether it is active there, how
 * many prices it annotated (`unparsable` of them without a result) and in
 * which currencies those prices were, and which auction house and auction the
 * page is about. Content script, background and panel all speak about a tab
 * in these terms.
 *
 * Messages between them carry plain objects (`toJSON()`); the receiving side
 * turns them back into a TabState with `from()`. Immutable.
 */
export class TabState {
  readonly active: boolean;
  readonly annotated: number;
  readonly unparsable: number;
  /** sorted, without duplicates */
  readonly currencies: readonly string[];
  readonly site: string | null;
  readonly house: string | null;
  readonly auction: string | null;

  /**
   * @param values.active whether the extension acts on the tab
   * @param values.annotated number of annotated prices
   * @param values.unparsable of those, the ones showing "n/a"
   * @param values.currencies currency codes of the prices on the page
   * @param values.site origin of the AuctionSite the tab is on, null when none
   * @param values.house auction house ID from the URL, null when unknown
   * @param values.auction auction ID from the URL, null when unknown
   */
  constructor({
    active = false,
    annotated = 0,
    unparsable = 0,
    currencies = [],
    site = null,
    house = null,
    auction = null,
  }: {
    active?: boolean;
    annotated?: number;
    unparsable?: number;
    currencies?: Iterable<string>;
    site?: string | null;
    house?: string | null;
    auction?: string | null;
  } = {}) {
    this.active = active;
    this.annotated = annotated;
    this.unparsable = unparsable;
    this.currencies = Object.freeze([...new Set(currencies)].sort());
    this.site = site;
    this.house = house;
    this.auction = auction;
    Object.freeze(this);
  }

  /**
   * Whether the tab is on an actual auction: active, and the URL names the
   * auction house or the auction. Only then does the panel offer the settings.
   */
  get onAuction(): boolean {
    return this.active && (this.house !== null || this.auction !== null);
  }

  /** Not active: nothing annotated. */
  static inactive(): TabState {
    return new TabState();
  }

  /**
   * A TabState out of a message payload; anything missing or of the wrong
   * type counts as inactive / zero / no currencies / unknown.
   */
  static from(data: unknown): TabState {
    const values = (data ?? {}) as { [field in keyof TabStateJSON]?: unknown };
    const count = (value: unknown) =>
      typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
    const id = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);
    const currencies = Array.isArray(values.currencies)
      ? values.currencies.filter((code): code is string => typeof code === "string")
      : [];
    return new TabState({
      active: values.active === true,
      annotated: count(values.annotated),
      unparsable: count(values.unparsable),
      currencies,
      site: id(values.site),
      house: id(values.house),
      auction: id(values.auction),
    });
  }

  equals(other: TabState | null | undefined): boolean {
    return (
      other != null &&
      this.active === other.active &&
      this.annotated === other.annotated &&
      this.unparsable === other.unparsable &&
      this.site === other.site &&
      this.house === other.house &&
      this.auction === other.auction &&
      this.currencies.length === other.currencies.length &&
      this.currencies.every((code, i) => code === other.currencies[i])
    );
  }

  /** Plain data for messages. */
  toJSON(): TabStateJSON {
    return {
      active: this.active,
      annotated: this.annotated,
      unparsable: this.unparsable,
      currencies: [...this.currencies],
      site: this.site,
      house: this.house,
      auction: this.auction,
    };
  }
}
