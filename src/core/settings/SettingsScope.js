/** @typedef {import("./AuctionKey.js").AuctionKey} AuctionKey */
/** @typedef {"site" | "house" | "auction"} KeyField */

/**
 * One level at which saved settings apply to a page: the parts of the
 * AuctionKey that must be equal. An entry saved for auction 7 of house "leu"
 * on biddr is found on the "auction" scope by every page of auction 7 on biddr,
 * on the "house" scope by every page of "leu" on biddr, and so on. Immutable.
 */
export class SettingsScope {
  /**
   * @param {object} config
   * @param {string} config.name identifies the scope, e.g. in tests
   * @param {readonly KeyField[]} config.fields the parts of the key that must match
   * @param {string} config.label what the panel calls settings found on this scope
   */
  constructor({ name, fields, label }) {
    /** @readonly */
    this.name = name;
    /** @readonly */
    this.fields = Object.freeze([...fields]);
    /** @readonly */
    this.label = label;
    Object.freeze(this);
  }

  /**
   * Can this scope say anything about `key`? Not when one of its fields is
   * unknown there - two unknown auction houses are not the same house.
   * @param {AuctionKey} key
   * @returns {boolean}
   */
  appliesTo(key) {
    return this.fields.every((field) => key[field] !== null);
  }

  /**
   * Do settings saved under `saved` apply to the page of `key` on this scope?
   * @param {AuctionKey} saved
   * @param {AuctionKey} key
   * @returns {boolean}
   */
  matches(saved, key) {
    return this.appliesTo(key) && this.fields.every((field) => saved[field] === key[field]);
  }
}

/**
 * Where the settings of a page come from, the most specific scope first: the
 * first scope holding saved settings wins, and within it the newest entry.
 * Without any, nothing saved applies. Reorder, add or drop scopes here to
 * change the lookup; saving always stores under the full key.
 */
export const SETTINGS_SCOPES = Object.freeze([
  new SettingsScope({ name: "auction", fields: ["site", "auction"], label: "this auction" }),
  new SettingsScope({ name: "house", fields: ["site", "house"], label: "this auction house" }),
  new SettingsScope({ name: "site", fields: ["site"], label: "this site" }),
]);
