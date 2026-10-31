import type { AuctionSite } from "./AuctionSite.ts";

/**
 * The auction sites the extension acts on. On a given URL the first site
 * (in list order) whose origin and paths match wins.
 */
export class SiteRegistry {
  readonly sites: readonly AuctionSite[];

  constructor(sites: readonly AuctionSite[]) {
    this.sites = Object.freeze([...sites]);
    Object.freeze(this);
  }

  /**
   * The site the extension should act as on this URL.
   */
  find(url: string | undefined | null): AuctionSite | null {
    return this.sites.find((site) => site.matches(url)) ?? null;
  }

  /**
   * Should the extension be active on this URL?
   */
  isTarget(url: string | undefined | null): boolean {
    return this.find(url) !== null;
  }

  /** Content script match patterns of all sites, without duplicates. */
  matchPatterns(): string[] {
    return [...new Set(this.sites.map((site) => site.matchPattern))];
  }
}
