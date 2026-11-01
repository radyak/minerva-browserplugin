import type { AuctionKey, KeyField } from "./AuctionKey.ts";

/**
 * One level at which saved settings apply to a page: the parts of the
 * AuctionKey that must be equal. An entry saved for auction 7 of house "leu"
 * on biddr is found on the "auction" scope by every page of auction 7 on biddr,
 * on the "house" scope by every page of "leu" on biddr, and so on.
 */
export type SettingsScope = {
  /** identifies the scope, e.g. in tests and the panel */
  readonly name: string;
  readonly fields: readonly KeyField[];
  /** what the panel calls settings found on this scope */
  readonly label: string;
};

/**
 * Where the settings of a page come from, the most specific scope first: the
 * first scope holding saved settings wins, and within it the newest entry.
 * Without any, nothing saved applies. Reorder, add or drop scopes here to
 * change the lookup; saving always stores under the full key.
 */
export const SETTINGS_SCOPES: readonly SettingsScope[] = [
  { name: "auction", fields: ["site", "auction"], label: "this auction" },
  { name: "house", fields: ["site", "house"], label: "this auction house" },
  { name: "site", fields: ["site"], label: "this site" },
];

/**
 * Do settings saved under `saved` apply to the page of `key` on `scope`? Never
 * when one of the scope's fields is unknown on the page - two unknown auction
 * houses are not the same house.
 */
export function scopeMatches(scope: SettingsScope, saved: AuctionKey, key: AuctionKey): boolean {
  return scope.fields.every((field) => key[field] !== null && saved[field] === key[field]);
}
