import { MSG } from "../core/messages.js";
import { SITES } from "../core/sites/sites.config.js";
import { TabState } from "../core/state/TabState.js";

/** Badge colour while the extension is active in a tab (Bootstrap "danger"). */
const BADGE_COLOR = "#dc3545";

/**
 * Background script / service worker: owns the toolbar badge, watches tab
 * navigation, forwards sync requests to the content scripts and tells the
 * panel what the active tab is doing. Everything it touches is passed in.
 */
export class BackgroundController {
  /**
   * @param {object} deps
   * @param {any} deps.ext the extension API (`tabs`, `action`, `runtime.onInstalled`)
   * @param {Pick<import("../browser/MessageBus.js").MessageBus, "on" | "sendToTab">} deps.bus
   * @param {Pick<import("../browser/SettingsStore.js").SettingsStore, "migrate">} deps.store
   * @param {import("../core/sites/SiteRegistry.js").SiteRegistry} [deps.sites]
   */
  constructor({ ext, bus, store, sites = SITES }) {
    this.ext = ext;
    this.bus = bus;
    this.store = store;
    this.sites = sites;
  }

  /**
   * Register every listener. Synchronously, as an MV3 service worker only
   * receives events whose listeners were added in its first turn.
   */
  start() {
    // Settings saved by an older version: convert them once, on update.
    this.ext.runtime.onInstalled.addListener(() => this.store.migrate());

    this.ext.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      // `url` changes on real navigations and on history.pushState alike.
      if (!changeInfo.url && changeInfo.status !== "complete") return;
      this.updateBadge(tabId, this.sites.isTarget(changeInfo.url ?? tab?.url));
      this.bus.sendToTab(tabId, { type: MSG.SYNC_REQUEST });
    });

    this.bus
      .on(MSG.STATE_CHANGED, (message, sender) => {
        if (sender.tab?.id != null) this.updateBadge(sender.tab.id, TabState.from(message).active);
      })
      .on(MSG.GET_ACTIVE_STATE, () => this.activeTabState());
  }

  /**
   * Show "ON" on the toolbar button of `tabId` while the extension is active there.
   * @param {number} tabId
   * @param {boolean} active
   */
  updateBadge(tabId, active) {
    this.ext.action?.setBadgeText({ tabId, text: active ? "ON" : "" });
    if (active) this.ext.action?.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
  }

  /**
   * The state of the active tab, freshly synced by its content script.
   * @returns {Promise<{url: string | null, active: boolean, annotated: number, unparsable: number}>}
   */
  async activeTabState() {
    const [tab] = await this.ext.tabs.query({ active: true, currentWindow: true });
    if (!tab) return { url: null, ...TabState.inactive().toJSON() };
    const state = await this.bus.sendToTab(tab.id, { type: MSG.SYNC_REQUEST });
    // No content script there (yet): judge by the URL alone.
    const fallback = new TabState({ active: this.sites.isTarget(tab.url) });
    return state ?? { url: tab.url ?? null, ...fallback.toJSON() };
  }
}
