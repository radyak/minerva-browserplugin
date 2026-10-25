import { AuctionKey } from "../../src/core/settings/AuctionKey.js";
import { SettingsBook } from "../../src/core/settings/SettingsBook.js";

/** @typedef {import("../../src/core/rates/ExchangeRates.js").ExchangeRates} ExchangeRates */
/** @typedef {import("../../src/core/settings/Settings.js").Settings} Settings */

/**
 * Stand-ins for the src/browser classes the controllers depend on. They record
 * what the controller does and let a test trigger what the browser would.
 */

/**
 * A MessageBus: records sent messages, `deliver()` calls the registered handler.
 * @param {{answers?: Record<string, any>}} [options] what `send()` answers per message
 *   type, or a function of the message computing it; `answers.tab` is what
 *   `sendToTab()` answers (or a function computing it)
 * @returns {any}
 */
export function fakeBus({ answers = {} } = {}) {
  const handlers = new Map();
  return {
    /** @type {any[]} */
    sent: [],
    /** @type {Array<[number, object]>} */
    sentToTabs: [],
    on(type, handler) {
      handlers.set(type, handler);
      return this;
    },
    async send(message) {
      this.sent.push(message);
      const answer = answers[message.type];
      return typeof answer === "function" ? answer(message) : answer;
    },
    async sendToTab(tabId, message) {
      this.sentToTabs.push([tabId, message]);
      return typeof answers.tab === "function" ? answers.tab(tabId, message) : answers.tab;
    },
    /** What the browser does when a message of `message.type` arrives. */
    deliver(message, sender = {}) {
      return handlers.get(message.type)?.(message, sender);
    },
  };
}

/**
 * A SettingsStore holding a SettingsBook and rates per currency in memory.
 * @param {{book?: SettingsBook, rates?: ExchangeRates[]}} [stored]
 * @returns {any}
 */
export function fakeStore({ book = new SettingsBook(), rates = [] } = {}) {
  const listeners = [];
  const byBase = (list) => Object.fromEntries(list.map((value) => [value.base, value]));
  let saved = byBase(rates);
  return {
    saved: /** @type {Array<{key: AuctionKey, settings: Settings, rates?: ExchangeRates}>} */ ([]),
    savedRates: /** @type {ExchangeRates[]} */ ([]),
    async load() {
      return { book, rates: saved };
    },
    async save(key, settings, newRates) {
      this.saved.push({ key, settings, rates: newRates });
      book = book.with(key, settings);
      if (newRates) saved = { ...saved, [newRates.base]: newRates };
    },
    async saveRates(newRates) {
      this.savedRates.push(newRates);
      saved = { ...saved, [newRates.base]: newRates };
    },
    onChange(listener) {
      listeners.push(listener);
    },
    /** Replace what is stored and notify like storage.onChanged would. */
    async change({ book: newBook = book, rates: newRates = Object.values(saved) } = {}) {
      book = newBook;
      saved = byBase(newRates);
      await Promise.all(listeners.map((listener) => listener()));
    },
  };
}

/**
 * A SettingsBook out of `[key values, settings]` pairs, oldest first.
 * @param {Array<[ConstructorParameters<typeof AuctionKey>[0], Settings]>} entries
 */
export const bookOf = (...entries) =>
  entries.reduce(
    (book, [key, settings]) => book.with(new AuctionKey(key), settings),
    new SettingsBook(),
  );

/** Let pending promise callbacks and timers run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
