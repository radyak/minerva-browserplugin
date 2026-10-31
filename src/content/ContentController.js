import { PriceAnnotator } from "../core/annotation/PriceAnnotator.js";
import { MSG } from "../core/messages.js";
import { ExchangeRates } from "../core/rates/ExchangeRates.js";
import { AuctionKey } from "../core/settings/AuctionKey.js";
import { Settings } from "../core/settings/Settings.js";
import { SettingsBook } from "../core/settings/SettingsBook.js";
import { SITES } from "../core/sites/sites.config.js";
import { TabState } from "../core/state/TabState.js";

/**
 * Keeps one page in sync with the core rules: annotates it whenever the page,
 * its URL or the settings change, and reports the resulting TabState. All
 * decisions live in ../core; this class only deals with the page lifecycle.
 * Everything it touches is passed in, so it runs against jsdom in the tests.
 */
export class ContentController {
  /** @type {TabState | null} null until the first sync, so that one is always reported */
  #lastState = null;
  #book = new SettingsBook();
  /** @type {import("../browser/SettingsStore.js").RatesByCurrency} */
  #rates = {};
  #stopped = false;
  /** @type {MutationObserver | null} */
  #observer = null;
  /** @type {number | null} the pending animation frame of a DOM change */
  #frame = null;
  /** @type {(() => void) | null} */
  #unwatchStore = null;

  /**
   * @param {object} deps
   * @param {Window & typeof globalThis} deps.window the page
   * @param {Pick<import("../browser/MessageBus.js").MessageBus, "on" | "off" | "send">} deps.bus
   * @param {Pick<import("../browser/SettingsStore.js").SettingsStore, "load" | "onChange">} deps.store
   * @param {import("../core/sites/SiteRegistry.js").SiteRegistry} [deps.sites]
   * @param {PriceAnnotator} [deps.annotator]
   * @param {() => boolean} [deps.isValid] whether the extension is still there; asked
   *   before each sync caused by the page (the content script entry point passes
   *   WXT's `ctx.isValid`, which notices a dead runtime and invalidates the context)
   */
  constructor({
    window,
    bus,
    store,
    sites = SITES,
    annotator = new PriceAnnotator(window.document),
    isValid = () => true,
  }) {
    this.window = window;
    this.bus = bus;
    this.store = store;
    this.sites = sites;
    this.annotator = annotator;
    this.isValid = isValid;
  }

  /** Load the settings, annotate the page and keep it annotated from now on. */
  async start() {
    // Settings first, so the page never shows an amount computed without them.
    await this.#loadSettings();
    if (this.#stopped) return;

    this.bus.on(MSG.SYNC_REQUEST, async () => {
      // Re-read the settings: the panel sends this right after saving them, and
      // must not depend on storage.onChanged having arrived first.
      await this.#loadSettings();
      return { url: this.window.location.href, ...this.sync("request").toJSON() };
    });

    // Single page apps swap the URL without reloading; the background script
    // notices and sends SYNC_REQUEST, these two cover the in-page cases.
    this.window.addEventListener("popstate", this.#onPopState);
    this.window.addEventListener("hashchange", this.#onHashChange);

    // Recalculate when the settings are saved in the panel or another tab.
    this.#unwatchStore = this.store.onChange(async () => {
      await this.#loadSettings();
      this.sync("settings");
    });

    this.sync("load");
    this.#observeDom();
  }

  /**
   * Undo `start()`: stop listening to the page, the messages and the storage,
   * and remove every annotation. Called when the extension is reloaded or
   * updated - this script then has a dead runtime, but keeps running in the tab.
   * Syncs still in flight end without touching the page.
   */
  stop() {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#observer?.disconnect();
    if (this.#frame !== null) this.window.cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.window.removeEventListener("popstate", this.#onPopState);
    this.window.removeEventListener("hashchange", this.#onHashChange);
    this.bus.off(MSG.SYNC_REQUEST);
    this.#unwatchStore?.();
    this.annotator.clear();
  }

  /**
   * Bring the page in line with the current URL and settings; report the
   * resulting state when it changed.
   * @param {string} reason what triggered the sync, sent along for debugging
   * @returns {TabState}
   */
  sync(reason) {
    if (this.#stopped) return this.#lastState ?? TabState.inactive();
    const url = this.window.location.href;
    const site = this.sites.find(url);
    // Off every site, clean up whatever an earlier run left behind.
    const state = site ? this.#annotate(site, url) : this.annotator.clear();
    const changed = !state.equals(this.#lastState);
    this.#lastState = state;
    if (changed) this.bus.send({ type: MSG.STATE_CHANGED, url, ...state.toJSON(), reason });
    return state;
  }

  /**
   * Annotate the page of `url` on `site` with the settings of its auction.
   * @param {import("../core/sites/AuctionSite.js").AuctionSite} site
   * @param {string} url
   * @returns {TabState}
   */
  #annotate(site, url) {
    const key = new AuctionKey({ site: site.origin, ...site.identify(url) });
    const { settings, rates } = this.settingsFor(key);
    return new TabState({
      ...this.annotator.annotate(site, settings, rates).toJSON(),
      ...key.toJSON(),
    });
  }

  /**
   * The settings saved for the auction of `key` (see SettingsBook#resolve), the
   * defaults when nothing saved applies, and the rates into their currency.
   * @param {AuctionKey} key
   * @returns {{settings: Settings, rates: ExchangeRates}}
   */
  settingsFor(key) {
    const settings = this.#book.resolve(key)?.settings ?? Settings.DEFAULT;
    const rates = this.#rates[settings.currency] ?? ExchangeRates.empty(settings.currency);
    return { settings, rates };
  }

  async #loadSettings() {
    const { book, rates } = await this.store.load();
    this.#book = book;
    this.#rates = rates;
  }

  /**
   * Re-run after DOM changes - the price element may be rendered late or have its
   * text replaced by the page's own JavaScript. `characterData` is what catches a
   * price that changes in place. Coalesced into one run per animation frame; the
   * annotator only writes on a real change, so our own updates settle after one
   * extra pass instead of looping.
   */
  #observeDom() {
    this.#observer = new this.window.MutationObserver(() => {
      if (this.#frame !== null) return;
      this.#frame = this.window.requestAnimationFrame(() => {
        this.#frame = null;
        this.#syncIfValid("mutation");
      });
    });
    this.#observer.observe(this.window.document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  #onPopState = () => this.#syncIfValid("popstate");
  #onHashChange = () => this.#syncIfValid("hashchange");

  /**
   * Sync for a page event, unless the extension is gone: `isValid()` is what
   * notices a dead runtime (and stops this controller) when nothing else does.
   * @param {string} reason
   */
  #syncIfValid(reason) {
    if (this.isValid()) this.sync(reason);
  }
}
