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
  /**
   * @param {object} [values]
   * @param {boolean} [values.active]
   * @param {number} [values.annotated] number of annotated prices
   * @param {number} [values.unparsable] of those, the ones showing "n/a"
   * @param {Iterable<string>} [values.currencies] currency codes of the prices on the page
   * @param {string | null} [values.house] auction house ID from the URL, null when unknown
   * @param {string | null} [values.auction] auction ID from the URL, null when unknown
   */
  constructor({
    active = false,
    annotated = 0,
    unparsable = 0,
    currencies = [],
    house = null,
    auction = null,
  } = {}) {
    /** @readonly */
    this.active = active;
    /** @readonly */
    this.annotated = annotated;
    /** @readonly */
    this.unparsable = unparsable;
    /** @readonly sorted, without duplicates */
    this.currencies = Object.freeze([...new Set(currencies)].sort());
    /** @readonly */
    this.house = house;
    /** @readonly */
    this.auction = auction;
    Object.freeze(this);
  }

  /** Not active: nothing annotated. */
  static inactive() {
    return new TabState();
  }

  /**
   * A TabState out of a message payload; anything missing or of the wrong
   * type counts as inactive / zero / no currencies / unknown.
   * @param {unknown} data
   * @returns {TabState}
   */
  static from(data) {
    const values =
      /** @type {{active?: unknown, annotated?: unknown, unparsable?: unknown, currencies?: unknown, house?: unknown, auction?: unknown}} */ (
        data ?? {}
      );
    const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
    const id = (value) => (typeof value === "string" && value !== "" ? value : null);
    const currencies = Array.isArray(values.currencies)
      ? values.currencies.filter((code) => typeof code === "string")
      : [];
    return new TabState({
      active: values.active === true,
      annotated: count(values.annotated),
      unparsable: count(values.unparsable),
      currencies,
      house: id(values.house),
      auction: id(values.auction),
    });
  }

  /**
   * @param {TabState | null | undefined} other
   * @returns {boolean}
   */
  equals(other) {
    return (
      other != null &&
      this.active === other.active &&
      this.annotated === other.annotated &&
      this.unparsable === other.unparsable &&
      this.house === other.house &&
      this.auction === other.auction &&
      this.currencies.length === other.currencies.length &&
      this.currencies.every((code, i) => code === other.currencies[i])
    );
  }

  /** @returns {{active: boolean, annotated: number, unparsable: number, currencies: string[], house: string | null, auction: string | null}} plain data for messages */
  toJSON() {
    return {
      active: this.active,
      annotated: this.annotated,
      unparsable: this.unparsable,
      currencies: [...this.currencies],
      house: this.house,
      auction: this.auction,
    };
  }
}
