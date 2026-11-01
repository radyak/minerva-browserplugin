/**
 * Which auction settings belong to: the site (its origin), the auction house
 * and the auction, as far as the page URL tells (see AuctionSite `ids`); null
 * stands for "not known". The key settings are saved under in the SettingsBook.
 * A TabState is an AuctionKey too.
 */
export type AuctionKey = {
  readonly site: string | null;
  readonly house: string | null;
  readonly auction: string | null;
};

/** One part of an AuctionKey. */
export type KeyField = keyof AuctionKey;

/** A non-empty string, or null for anything else. */
export const idOf = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

export const AuctionKey = {
  /** The parts of a key, from the broadest to the most specific. */
  FIELDS: ["site", "house", "auction"] as const,

  /**
   * Just the key of anything carrying `site`, `house` and `auction` (a TabState,
   * a stored entry, a partial key); anything but a non-empty string is unknown.
   */
  from(data: unknown): AuctionKey {
    const values = data as Partial<Record<KeyField, unknown>> | null | undefined;
    return { site: idOf(values?.site), house: idOf(values?.house), auction: idOf(values?.auction) };
  },

  /** Whether `a` and `b` name the same auction (fields compared one by one). */
  equals(a: AuctionKey, b: AuctionKey | null | undefined): boolean {
    return b != null && AuctionKey.FIELDS.every((field) => a[field] === b[field]);
  },
};
