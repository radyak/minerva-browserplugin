import { ExchangeRates } from "../../src/core/rates/ExchangeRates.js";
import { Settings } from "../../src/core/settings/Settings.js";

/**
 * Stand-ins for the src/browser classes the controllers depend on. They record
 * what the controller does and let a test trigger what the browser would.
 */

/**
 * A MessageBus: records sent messages, `deliver()` calls the registered handler.
 * @param {{answers?: Record<string, any>}} [options] what `send()` answers per message
 *   type; `answers.tab` is what `sendToTab()` answers (or a function computing it)
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
      return answers[message.type];
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
 * A SettingsStore holding `settings` and `rates` in memory.
 * @returns {any}
 */
export function fakeStore(
  settings = Settings.DEFAULT,
  rates = ExchangeRates.empty(settings.currency),
) {
  const listeners = [];
  return {
    saved: /** @type {Array<{settings: Settings, rates?: ExchangeRates}>} */ ([]),
    savedRates: /** @type {ExchangeRates[]} */ ([]),
    async load() {
      return { settings, rates };
    },
    async save(newSettings, newRates) {
      this.saved.push({ settings: newSettings, rates: newRates });
      settings = newSettings;
      if (newRates) rates = newRates;
    },
    async saveRates(newRates) {
      this.savedRates.push(newRates);
      rates = newRates;
    },
    onChange(listener) {
      listeners.push(listener);
    },
    /** Replace what is stored and notify like storage.onChanged would. */
    async change(newSettings, newRates = ExchangeRates.empty(newSettings.currency)) {
      settings = newSettings;
      rates = newRates;
      await Promise.all(listeners.map((listener) => listener()));
    },
  };
}

/** Let pending promise callbacks and timers run. */
export const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
