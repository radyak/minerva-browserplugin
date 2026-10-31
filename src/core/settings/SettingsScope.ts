import type { AuctionKey, KeyField } from "./AuctionKey.ts";

/**
 * One level at which saved settings apply to a page: the parts of the
 * AuctionKey that must be equal. An entry saved for auction 7 of house "leu"
 * on biddr is found on the "auction" scope by every page of auction 7 on biddr,
 * on the "house" scope by every page of "leu" on biddr, and so on. Immutable.
 */
export class SettingsScope {
  readonly name: string;
  readonly fields: readonly KeyField[];
  readonly label: string;
  /**
   * @param config.name identifies the scope, e.g. in tests
   * @param config.fields the parts of the key that must match
   * @param config.label what the panel calls settings found on this scope
   */
  constructor({
    name,
    fields,
    label,
  }: {
    name: string;
    fields: readonly KeyField[];
    label: string;
  }) {
    this.name = name;
    this.fields = Object.freeze([...fields]);
    this.label = label;
    Object.freeze(this);
  }

  /**
   * Can this scope say anything about `key`? Not when one of its fields is
   * unknown there - two unknown auction houses are not the same house.
   */
  appliesTo(key: AuctionKey): boolean {
    return this.fields.every((field) => key[field] !== null);
  }

  /**
   * Do settings saved under `saved` apply to the page of `key` on this scope?
   */
  matches(saved: AuctionKey, key: AuctionKey): boolean {
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
