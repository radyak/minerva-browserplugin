/** `AuctionKey#toJSON()`. */
export type AuctionKeyJSON = { site: string | null; house: string | null; auction: string | null };

/** One part of an AuctionKey. */
export type KeyField = (typeof AuctionKey.FIELDS)[number];

/**
 * Which auction settings belong to: the site (its origin), the auction house
 * and the auction, as far as the page URL tells (see AuctionSite `ids`). The
 * composite key settings are saved under in the SettingsBook; null stands for
 * "not known". Immutable.
 */
export class AuctionKey {
  /** The parts of a key, from the broadest to the most specific. */
  static FIELDS = Object.freeze(["site", "house", "auction"] as const);
  readonly site: string | null;
  readonly house: string | null;
  readonly auction: string | null;

  /**
   * @param values.site origin of the AuctionSite
   * @param values.house auction house ID
   * @param values.auction auction ID
   */
  constructor({
    site = null,
    house = null,
    auction = null,
  }: { site?: string | null; house?: string | null; auction?: string | null } = {}) {
    this.site = site;
    this.house = house;
    this.auction = auction;
    Object.freeze(this);
  }

  /**
   * The key of anything carrying `site`, `house` and `auction` (a TabState, a
   * stored entry); anything but a non-empty string counts as unknown.
   */
  static from(data: unknown): AuctionKey {
    const values = data as Record<string, unknown> | null | undefined;
    const id = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);
    return new AuctionKey({
      site: id(values?.site),
      house: id(values?.house),
      auction: id(values?.auction),
    });
  }

  equals(other: AuctionKey | null | undefined): boolean {
    return other != null && AuctionKey.FIELDS.every((field) => this[field] === other[field]);
  }

  /** Plain data to store. */
  toJSON(): AuctionKeyJSON {
    return { site: this.site, house: this.house, auction: this.auction };
  }
}
