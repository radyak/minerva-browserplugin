/**
 * Which auction settings belong to: the site (its origin), the auction house
 * and the auction, as far as the page URL tells (see AuctionSite `ids`). The
 * composite key settings are saved under in the SettingsBook; null stands for
 * "not known". Immutable.
 */
export class AuctionKey {
  /** The parts of a key, from the broadest to the most specific. */
  static FIELDS = Object.freeze(/** @type {const} */ (["site", "house", "auction"]));

  /**
   * @param {object} [values]
   * @param {string | null} [values.site] origin of the AuctionSite
   * @param {string | null} [values.house] auction house ID
   * @param {string | null} [values.auction] auction ID
   */
  constructor({ site = null, house = null, auction = null } = {}) {
    /** @readonly */
    this.site = site;
    /** @readonly */
    this.house = house;
    /** @readonly */
    this.auction = auction;
    Object.freeze(this);
  }

  /**
   * The key of anything carrying `site`, `house` and `auction` (a TabState, a
   * stored entry); anything but a non-empty string counts as unknown.
   * @param {unknown} data
   * @returns {AuctionKey}
   */
  static from(data) {
    const values = /** @type {Record<string, unknown> | null | undefined} */ (data);
    const id = (value) => (typeof value === "string" && value !== "" ? value : null);
    return new AuctionKey({
      site: id(values?.site),
      house: id(values?.house),
      auction: id(values?.auction),
    });
  }

  /**
   * @param {AuctionKey | null | undefined} other
   * @returns {boolean}
   */
  equals(other) {
    return other != null && AuctionKey.FIELDS.every((field) => this[field] === other[field]);
  }

  /** @returns {{site: string | null, house: string | null, auction: string | null}} plain data to store */
  toJSON() {
    return { site: this.site, house: this.house, auction: this.auction };
  }
}
