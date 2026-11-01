import { SETTINGS_SCOPES, type SettingsScope } from "../core/settings/SettingsScope.ts";
import type { TabState } from "../core/state/TabState.ts";

/** One pill per scope, most specific first (as SETTINGS_SCOPES looks them up), plus the defaults. */
const PILLS = [
  ...SETTINGS_SCOPES.map(({ name, label }) => ({
    name,
    text: name.charAt(0).toUpperCase() + name.slice(1),
    title: `Saved for ${label}.`,
  })),
  { name: "defaults", text: "Defaults", title: "Nothing saved yet: defaults." },
];

/**
 * The top of the panel: the auction house and auction the active tab is on,
 * as read from its URL, and which saved settings the form shows (auction,
 * house, site or the defaults - the highlighted pill).
 * @param props.scope where the shown settings were found; null for the defaults
 */
export function AuctionHeader({ tab, scope }: { tab: TabState; scope: SettingsScope | null }) {
  const current = scope?.name ?? "defaults";
  return (
    <header>
      <table className="table table-sm small mb-0">
        <tbody>
          <tr>
            <td>Auction house</td>
            <td className="text-end fw-semibold">{tab.house ?? "unknown"}</td>
          </tr>
          <tr>
            <td>Auction</td>
            <td className="text-end fw-semibold">{tab.auction ?? "unknown"}</td>
          </tr>
        </tbody>
      </table>
      <div className="d-flex align-items-center flex-wrap gap-1 px-1 pt-1 small">
        <span className="text-body-secondary me-1">Values from</span>
        <span className="d-flex flex-wrap gap-1" aria-label="Values from">
          {PILLS.map(({ name, text, title }) => (
            <span
              key={name}
              title={title}
              aria-current={name === current ? "true" : undefined}
              className={
                name === current
                  ? "badge rounded-pill text-bg-primary"
                  : "badge rounded-pill text-body-tertiary border"
              }
            >
              {text}
            </span>
          ))}
        </span>
      </div>
    </header>
  );
}
