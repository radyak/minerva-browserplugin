import type { MessageBus } from "../browser/MessageBus.ts";
import type { RatesByCurrency, SettingsStore } from "../browser/SettingsStore.ts";
import { PriceAnnotator } from "../core/annotation/PriceAnnotator.ts";
import { MSG } from "../core/messages.ts";
import { ExchangeRates } from "../core/rates/ExchangeRates.ts";
import type { AuctionKey } from "../core/settings/AuctionKey.ts";
import { Settings } from "../core/settings/Settings.ts";
import { SettingsBook } from "../core/settings/SettingsBook.ts";
import { SITES } from "../core/sites/sites.config.ts";
import { findSite, identify, type AuctionSite } from "../core/sites/sites.ts";
import { TabState } from "../core/state/TabState.ts";

type Deps = {
  /** the page */
  window: Window & typeof globalThis;
  bus: Pick<MessageBus, "on" | "off" | "send">;
  store: Pick<SettingsStore, "load" | "onChange">;
  sites?: readonly AuctionSite[];
  annotator?: PriceAnnotator;
  /**
   * whether the extension is still there; asked before each sync caused by the
   * page (the content script entry point passes WXT's `ctx.isValid`, which
   * notices a dead runtime and invalidates the context)
   */
  isValid?: () => boolean;
};

/**
 * Keeps one page in sync with the core rules: annotates it whenever the page,
 * its URL or the settings change, and reports the resulting TabState. All
 * decisions live in ../core; this class only deals with the page lifecycle.
 * Everything it touches is passed in, so it runs against jsdom in the tests.
 */
export class ContentController {
  /** null until the first sync, so that one is always reported */
  #lastState: TabState | null = null;
  #book = new SettingsBook();
  #rates: RatesByCurrency = {};
  #stopped = false;
  #observer: MutationObserver | null = null;
  /** the pending animation frame of a DOM change */
  #frame: number | null = null;
  #unwatchStore: (() => void) | null = null;

  readonly #deps: Required<Deps>;

  constructor(deps: Deps) {
    this.#deps = {
      sites: SITES,
      annotator: new PriceAnnotator(deps.window.document),
      isValid: () => true,
      ...deps,
    };
  }

  /** Load the settings, annotate the page and keep it annotated from now on. */
  async start(): Promise<void> {
    // Settings first, so the page never shows an amount computed without them.
    await this.#loadSettings();
    if (this.#stopped) return;
    const { window, bus, store } = this.#deps;

    bus.on(MSG.SYNC_REQUEST, async () => {
      // Re-read the settings: the panel sends this right after saving them, and
      // must not depend on storage.onChanged having arrived first.
      await this.#loadSettings();
      return { url: window.location.href, ...this.sync("request") };
    });

    // Single page apps swap the URL without reloading; the background script
    // notices and sends SYNC_REQUEST, these two cover the in-page cases.
    window.addEventListener("popstate", this.#onPopState);
    window.addEventListener("hashchange", this.#onHashChange);

    // Recalculate when the settings are saved in the panel or another tab.
    this.#unwatchStore = store.onChange(async () => {
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
  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    const { window, bus, annotator } = this.#deps;
    this.#observer?.disconnect();
    if (this.#frame !== null) window.cancelAnimationFrame(this.#frame);
    this.#frame = null;
    window.removeEventListener("popstate", this.#onPopState);
    window.removeEventListener("hashchange", this.#onHashChange);
    bus.off(MSG.SYNC_REQUEST);
    this.#unwatchStore?.();
    annotator.clear();
  }

  /**
   * Bring the page in line with the current URL and settings; report the
   * resulting state when it changed.
   * @param reason what triggered the sync, sent along for debugging
   */
  sync(reason: string): TabState {
    if (this.#stopped) return this.#lastState ?? TabState.inactive();
    const { window, sites, annotator, bus } = this.#deps;
    const url = window.location.href;
    const site = findSite(sites, url);
    // Off every site, clean up whatever an earlier run left behind.
    const state = site ? this.#annotate(site, url) : annotator.clear();
    const changed = !TabState.equals(state, this.#lastState);
    this.#lastState = state;
    if (changed) bus.send({ type: MSG.STATE_CHANGED, url, ...state, reason });
    return state;
  }

  /**
   * Annotate the page of `url` on `site` with the settings of its auction.
   */
  #annotate(site: AuctionSite, url: string): TabState {
    const key: AuctionKey = { site: site.origin, ...identify(site, url) };
    const { settings, rates } = this.settingsFor(key);
    return { ...this.#deps.annotator.annotate(site, settings, rates), ...key };
  }

  /**
   * The settings saved for the auction of `key` (see SettingsBook#resolve), the
   * defaults when nothing saved applies, and the rates into their currency.
   */
  settingsFor(key: AuctionKey): { settings: Settings; rates: ExchangeRates } {
    const settings = this.#book.resolve(key)?.settings ?? Settings.DEFAULT;
    const rates = this.#rates[settings.currency] ?? ExchangeRates.empty(settings.currency);
    return { settings, rates };
  }

  async #loadSettings(): Promise<void> {
    const { book, rates } = await this.#deps.store.load();
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
  #observeDom(): void {
    const { window } = this.#deps;
    this.#observer = new window.MutationObserver(() => {
      if (this.#frame !== null) return;
      this.#frame = window.requestAnimationFrame(() => {
        this.#frame = null;
        this.#syncIfValid("mutation");
      });
    });
    this.#observer.observe(window.document.documentElement, {
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
   */
  #syncIfValid(reason: string): void {
    if (this.#deps.isValid()) this.sync(reason);
  }
}
