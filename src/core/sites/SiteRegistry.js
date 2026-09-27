/**
 * The auction sites the extension acts on. On a given URL the first site
 * (in list order) whose origin and paths match wins.
 */
export class SiteRegistry {
  /** @param {readonly import("./AuctionSite.js").AuctionSite[]} sites */
  constructor(sites) {
    /** @readonly */
    this.sites = Object.freeze([...sites]);
    Object.freeze(this);
  }

  /**
   * The site the extension should act as on this URL.
   * @param {string | undefined | null} url
   * @returns {import("./AuctionSite.js").AuctionSite | null}
   */
  find(url) {
    return this.sites.find((site) => site.matches(url)) ?? null;
  }

  /**
   * Should the extension be active on this URL?
   * @param {string | undefined | null} url
   * @returns {boolean}
   */
  isTarget(url) {
    return this.find(url) !== null;
  }

  /** @returns {string[]} content script match patterns of all sites, without duplicates */
  matchPatterns() {
    return [...new Set(this.sites.map((site) => site.matchPattern))];
  }
}
