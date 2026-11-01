import type { ExchangeRates } from "../../src/core/rates/ExchangeRates.ts";
import { AuctionKey } from "../../src/core/settings/AuctionKey.ts";
import { BuyerCosts } from "../../src/core/settings/BuyerCosts.ts";
import type { Settings } from "../../src/core/settings/Settings.ts";
import { SettingsBook } from "../../src/core/settings/SettingsBook.ts";

/*
 * Stand-ins for the src/browser classes the controllers depend on. They record
 * what the controller does and let a test trigger what the browser would. They
 * are typed loosely (`any`) on purpose: a test may hand them anything.
 */

type Answer = unknown | ((...args: any[]) => unknown);

/**
 * A MessageBus: records sent messages, `deliver()` calls the registered handler.
 * @param options.answers what `send()` answers per message type, or a function of
 *   the message computing it; `answers.tab` is what `sendToTab()` answers (or a
 *   function of tab ID and message computing it)
 */
export function fakeBus({ answers = {} }: { answers?: Record<string, Answer> } = {}): any {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  const answer = (key: string, ...args: unknown[]) => {
    const value = answers[key];
    return typeof value === "function" ? value(...args) : value;
  };
  return {
    sent: [] as any[],
    sentToTabs: [] as Array<[number, object]>,
    on(type: string, handler: (...args: any[]) => unknown) {
      handlers.set(type, handler);
      return this;
    },
    off(type: string) {
      handlers.delete(type);
      return this;
    },
    async send(message: { type: string }) {
      this.sent.push(message);
      return answer(message.type, message);
    },
    async sendToTab(tabId: number, message: object) {
      this.sentToTabs.push([tabId, message]);
      return answer("tab", tabId, message);
    },
    /** What the browser does when a message of `message.type` arrives. */
    deliver(message: { type: string; [key: string]: unknown }, sender = {}) {
      return handlers.get(message.type)?.(message, sender);
    },
  };
}

/**
 * A SettingsStore holding a SettingsBook, rates per currency and the buyer
 * costs in memory. `saved` records the settings saves, `buyer` holds the
 * buyer costs as last saved.
 */
export function fakeStore({
  book = new SettingsBook(),
  rates = [],
  buyer = BuyerCosts.DEFAULT,
}: { book?: SettingsBook; rates?: ExchangeRates[]; buyer?: BuyerCosts } = {}): any {
  const listeners: Array<() => unknown> = [];
  const byBase = (list: ExchangeRates[]) =>
    Object.fromEntries(list.map((value) => [value.base, value]));
  let saved: Record<string, ExchangeRates> = byBase(rates);
  return {
    saved: [] as Array<{ key: AuctionKey; settings: Settings; rates?: ExchangeRates }>,
    savedRates: [] as ExchangeRates[],
    buyer,
    async load() {
      return { book, rates: saved, buyer: this.buyer };
    },
    async save(
      key: AuctionKey,
      settings: Settings,
      newRates?: ExchangeRates,
      newBuyer?: BuyerCosts,
    ) {
      this.saved.push({ key, settings, rates: newRates });
      if (newBuyer) this.buyer = newBuyer;
      book = book.with(key, settings);
      if (newRates) saved = { ...saved, [newRates.base]: newRates };
    },
    async saveRates(newRates: ExchangeRates) {
      this.savedRates.push(newRates);
      saved = { ...saved, [newRates.base]: newRates };
    },
    onChange(listener: () => unknown) {
      listeners.push(listener);
      return () => listeners.splice(listeners.indexOf(listener), 1);
    },
    /** Replace what is stored and notify like storage.onChanged would. */
    async change({
      book: newBook = book,
      rates: newRates = Object.values(saved),
      buyer: newBuyer = this.buyer,
    }: { book?: SettingsBook; rates?: ExchangeRates[]; buyer?: BuyerCosts } = {}) {
      book = newBook;
      saved = byBase(newRates);
      this.buyer = newBuyer;
      await Promise.all(listeners.map((listener) => listener()));
    },
  };
}

/** A SettingsBook out of `[key values, settings]` pairs, oldest first. */
export const bookOf = (...entries: Array<[Partial<AuctionKey>, Settings]>) =>
  entries.reduce(
    (book, [key, settings]) => book.with(AuctionKey.from(key), settings),
    new SettingsBook(),
  );

/** Let pending promise callbacks and timers run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
