import assert from "node:assert/strict";
import test from "node:test";

import { AuctionKey } from "../src/core/settings/AuctionKey.js";
import { Settings } from "../src/core/settings/Settings.js";
import { SettingsBook } from "../src/core/settings/SettingsBook.js";
import { SETTINGS_SCOPES, SettingsScope } from "../src/core/settings/SettingsScope.js";
import { bookOf } from "./support/fakes.mjs";

const A = "https://a.test";
const B = "https://b.test";
const premium = (auctionPremium) => new Settings({ auctionPremium, shipment: 0, currency: "EUR" });

/** The premium and scope `book` resolves for `key`, or null. */
const resolve = (book, key) => {
  const found = book.resolve(new AuctionKey(key));
  return found && [found.settings.auctionPremium, found.scope.name];
};

test("finds the settings of the auction first, then of the house, then of the site", () => {
  const book = bookOf(
    [{ site: A, house: "leu", auction: "1" }, premium(10)],
    [{ site: A, house: "leu", auction: "2" }, premium(20)],
    [{ site: A, house: "cng", auction: "3" }, premium(30)],
  );
  assert.deepEqual(resolve(book, { site: A, house: "leu", auction: "1" }), [10, "auction"]);
  // Another auction of the house: the newest one saved for the house.
  assert.deepEqual(resolve(book, { site: A, house: "leu", auction: "9" }), [20, "house"]);
  // Another house: the newest one saved on the site.
  assert.deepEqual(resolve(book, { site: A, house: "nac", auction: "9" }), [30, "site"]);
  assert.deepEqual(resolve(book, { site: A }), [30, "site"]);
  // Nothing saved on the site: nothing applies.
  assert.equal(resolve(book, { site: B, house: "leu", auction: "1" }), null);
  assert.equal(resolve(book, {}), null);
});

test("matches the auction regardless of the house", () => {
  // The house may not be in every URL of an auction.
  const book = bookOf([{ site: A, house: "leu", auction: "1" }, premium(10)]);
  assert.deepEqual(resolve(book, { site: A, auction: "1" }), [10, "auction"]);
});

test("does not take unknown IDs for equal ones", () => {
  const book = bookOf(
    [{ site: A, house: "leu", auction: "1" }, premium(10)],
    [{ site: A, auction: "2" }, premium(20)],
  );
  // Neither the house nor the auction is known: only the site scope applies.
  assert.deepEqual(resolve(book, { site: A }), [20, "site"]);
  // Unknown house: the house scope is skipped, not matched against house-less entries.
  assert.deepEqual(resolve(book, { site: A, auction: "9" }), [20, "site"]);
});

test("replaces what was saved under the same key and keeps it the newest", () => {
  const key = new AuctionKey({ site: A, house: "leu", auction: "1" });
  const book = bookOf(
    [key, premium(10)],
    [{ site: A, house: "leu", auction: "2" }, premium(20)],
  ).with(key, premium(15));
  assert.deepEqual(
    book.entries.map(({ key, settings }) => [key.auction, settings.auctionPremium]),
    [
      ["2", 20],
      ["1", 15],
    ],
  );
  assert.deepEqual(resolve(book, { site: A, house: "leu", auction: "9" }), [15, "house"]);
  assert.throws(() => book.with(new AuctionKey({ auction: "1" }), premium(1)), /site/);
});

test("follows the order and choice of its scopes", () => {
  const siteOnly = [new SettingsScope({ name: "site", fields: ["site"], label: "this site" })];
  const entries = bookOf(
    [{ site: A, house: "leu", auction: "1" }, premium(10)],
    [{ site: A, house: "cng", auction: "2" }, premium(20)],
  ).entries;
  const book = new SettingsBook(entries, siteOnly);
  assert.deepEqual(resolve(book, { site: A, house: "leu", auction: "1" }), [20, "site"]);
  assert.deepEqual(
    SETTINGS_SCOPES.map((scope) => scope.name),
    ["auction", "house", "site"],
  );
});

test("survives a round trip through storage and drops entries without a site", () => {
  const book = bookOf(
    [{ site: A, house: "leu", auction: "1" }, premium(10)],
    [{ site: B }, premium(20)],
  );
  const stored = structuredClone(book.toJSON());
  assert.deepEqual(stored[1], {
    site: B,
    house: null,
    auction: null,
    settings: premium(20).toJSON(),
  });
  assert.deepEqual(SettingsBook.from(stored), book);
  assert.deepEqual(SettingsBook.from([{ house: "leu", settings: {} }, null]).entries, []);
  assert.deepEqual(SettingsBook.from("garbage").entries, []);
  assert.deepEqual(SettingsBook.from([{ site: A, settings: { auctionPremium: 500 } }]).entries, [
    { key: new AuctionKey({ site: A }), settings: Settings.DEFAULT },
  ]);
});

test("lists the currencies of all saved settings", () => {
  const book = bookOf(
    [{ site: A }, premium(10)],
    [{ site: B }, new Settings({ auctionPremium: 0, shipment: 0, currency: "CHF" })],
  );
  assert.deepEqual([...book.currencies()], ["EUR", "CHF"]);
});
