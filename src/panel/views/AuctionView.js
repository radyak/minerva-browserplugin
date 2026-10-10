import { SETTINGS_SCOPES } from "../../core/settings/SettingsScope.js";

/** @typedef {import("../../core/settings/SettingsScope.js").SettingsScope} SettingsScope */

/** Text for an ID the URL does not reveal. */
const UNKNOWN_ID = "unknown";

/** The last pill of the source indicator: nothing saved applies. */
const DEFAULTS = { name: "defaults", text: "Defaults", title: "Nothing saved yet: defaults." };

/** A highlighted pill and the others. */
const PILL_ACTIVE = "badge rounded-pill text-bg-primary";
const PILL_INACTIVE = "badge rounded-pill text-body-tertiary border";

/**
 * The top of the panel: the auction house and auction the active tab is on,
 * as read from its URL, and which saved settings the form shows (auction,
 * house, site or the defaults). Shown together with the settings form, i.e.
 * only while the tab is on an auction (`TabState#onAuction`).
 */
export class AuctionView {
  /**
   * @param {object} elements
   * @param {HTMLElement} elements.ids the block holding house, auction and source
   * @param {HTMLElement} elements.house
   * @param {HTMLElement} elements.auction
   * @param {HTMLElement} elements.source receives one pill per scope plus the defaults
   */
  constructor({ ids, house, auction, source }) {
    this.ids = ids;
    this.house = house;
    this.auction = auction;
    // One pill per scope, most specific first, as SETTINGS_SCOPES looks them up.
    const options = [
      ...SETTINGS_SCOPES.map(({ name, label }) => ({
        name,
        text: name[0].toUpperCase() + name.slice(1),
        title: `Saved for ${label}.`,
      })),
      DEFAULTS,
    ];
    /** @type {Map<string, HTMLElement>} pill per scope name */
    this.pills = new Map(
      options.map(({ name, text, title }) => {
        const pill = source.ownerDocument.createElement("span");
        pill.className = PILL_INACTIVE;
        pill.dataset.scope = name;
        pill.textContent = text;
        pill.title = title;
        return [name, pill];
      }),
    );
    source.replaceChildren(...this.pills.values());
  }

  /** @param {import("../../core/state/TabState.js").TabState} state */
  render(state) {
    this.ids.hidden = !state.onAuction;
    this.house.textContent = state.house ?? UNKNOWN_ID;
    this.auction.textContent = state.auction ?? UNKNOWN_ID;
  }

  /**
   * Highlight where the settings in the form come from.
   * @param {SettingsScope | null} scope the scope they were found on; null for the defaults
   */
  showSource(scope) {
    const current = scope?.name ?? DEFAULTS.name;
    for (const [name, pill] of this.pills) {
      const active = name === current;
      pill.className = active ? PILL_ACTIVE : PILL_INACTIVE;
      if (active) pill.setAttribute("aria-current", "true");
      else pill.removeAttribute("aria-current");
    }
  }
}
