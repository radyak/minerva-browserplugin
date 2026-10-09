import { PriceAnnotator } from "../core/annotation/PriceAnnotator.js";
import { MSG } from "../core/messages.js";
import { ExchangeRates } from "../core/rates/ExchangeRates.js";
import { Settings } from "../core/settings/Settings.js";
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
  #settings = Settings.DEFAULT;
  #rates = ExchangeRates.empty(Settings.DEFAULT.currency);

  /**
   * @param {object} deps
   * @param {Window & typeof globalThis} deps.window the page
   * @param {Pick<import("../browser/MessageBus.js").MessageBus, "on" | "send">} deps.bus
   * @param {Pick<import("../browser/SettingsStore.js").SettingsStore, "load" | "onChange">} deps.store
   * @param {import("../core/sites/SiteRegistry.js").SiteRegistry} [deps.sites]
   * @param {PriceAnnotator} [deps.annotator]
   */
  constructor({
    window,
    bus,
    store,
    sites = SITES,
    annotator = new PriceAnnotator(window.document),
  }) {
    this.window = window;
    this.bus = bus;
    this.store = store;
    this.sites = sites;
    this.annotator = annotator;
  }

  /** Load the settings, annotate the page and keep it annotated from now on. */
  async start() {
    // Settings first, so the page never shows an amount computed without them.
    await this.#loadSettings();

    this.bus.on(MSG.SYNC_REQUEST, async () => {
      // Re-read the settings: the panel sends this right after saving them, and
      // must not depend on storage.onChanged having arrived first.
      await this.#loadSettings();
      return { url: this.window.location.href, ...this.sync("request").toJSON() };
    });

    // Single page apps swap the URL without reloading; the background script
    // notices and sends SYNC_REQUEST, these two cover the in-page cases.
    this.window.addEventListener("popstate", () => this.sync("popstate"));
    this.window.addEventListener("hashchange", () => this.sync("hashchange"));

    // Recalculate when the settings are saved in the panel or another tab.
    this.store.onChange(async () => {
      await this.#loadSettings();
      this.sync("settings");
    });

    this.sync("load");
    this.#observeDom();
  }

  /**
   * Bring the page in line with the current URL and settings; report the
   * resulting state when it changed.
   * @param {string} reason what triggered the sync, sent along for debugging
   * @returns {TabState}
   */
  sync(reason) {
    const url = this.window.location.href;
    const site = this.sites.find(url);
    // Off every site, clean up whatever an earlier run left behind.
    const state = site
      ? new TabState({
          ...this.annotator.annotate(site, this.#settings, this.#rates).toJSON(),
          ...site.identify(url),
        })
      : this.annotator.clear();
    const changed = !state.equals(this.#lastState);
    this.#lastState = state;
    if (changed) this.bus.send({ type: MSG.STATE_CHANGED, url, ...state.toJSON(), reason });
    return state;
  }

  async #loadSettings() {
    const { settings, rates } = await this.store.load();
    this.#settings = settings;
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
    let scheduled = false;
    const observer = new this.window.MutationObserver(() => {
      if (scheduled) return;
      scheduled = true;
      this.window.requestAnimationFrame(() => {
        scheduled = false;
        this.sync("mutation");
      });
    });
    observer.observe(this.window.document.documentElement, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
}
