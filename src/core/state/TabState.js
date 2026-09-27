/**
 * What the extension is doing in one tab: whether it is active there and how
 * many prices it annotated (`unparsable` of them without a result). Content
 * script, background and panel all speak about a tab in these terms.
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
   */
  constructor({ active = false, annotated = 0, unparsable = 0 } = {}) {
    /** @readonly */
    this.active = active;
    /** @readonly */
    this.annotated = annotated;
    /** @readonly */
    this.unparsable = unparsable;
    Object.freeze(this);
  }

  /** Not active: nothing annotated. */
  static inactive() {
    return new TabState();
  }

  /**
   * A TabState out of a message payload; anything missing or of the wrong
   * type counts as inactive / zero.
   * @param {unknown} data
   * @returns {TabState}
   */
  static from(data) {
    const values = /** @type {{active?: unknown, annotated?: unknown, unparsable?: unknown}} */ (
      data ?? {}
    );
    const count = (value) => (Number.isInteger(value) && value >= 0 ? value : 0);
    return new TabState({
      active: values.active === true,
      annotated: count(values.annotated),
      unparsable: count(values.unparsable),
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
      this.unparsable === other.unparsable
    );
  }

  /** @returns {{active: boolean, annotated: number, unparsable: number}} plain data for messages */
  toJSON() {
    return { active: this.active, annotated: this.annotated, unparsable: this.unparsable };
  }
}
