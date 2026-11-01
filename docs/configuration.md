# Configuration

The auction sites the extension acts on live in
[`src/core/sites/sites.config.ts`](../src/core/sites/sites.config.ts): `SITES` holds one
`AuctionSite` per site, each made with `defineSite({ … })`:

| Field | Example (biddr.com) | Meaning |
| --- | --- | --- |
| `origin` | `https://www.biddr.com` | protocol + host (optionally a port), no path; `<protocol>//<host>/*` is baked into both manifests as the content script match pattern |
| `paths` | `["/*"]` | path globs on that host, e.g. `/live/g-m-auction` or `/live/*`; the extension only acts while the page path matches one of them (`*` = any characters, otherwise exact; query and hash are ignored) |
| `priceSelectors` | `[".current-bid"]` | the elements whose text holds the price |
| `ids` | `{ house: { path: "/:id/auction" }, auction: { query: "a" } }` | where the page URL names the auction house *(optional)* and the auction; shown at the top of the panel and part of the key the settings are saved under |
| `calculator` | *(optional)* | a `PriceCalculator` function for sites whose fees differ; `effectivePrice` by default |

An ID is read (`identify()` in `src/core/sites/sites.ts`) either from a query
parameter - `{ query: "a" }` reads `7522` from `?a=7522` - or from one path
segment - `{ path: "/sale/:id*" }` reads `7123` from `/sale/7123/lot/45`. In
a path pattern `:id` marks the segment (exactly once), `*` matches any characters
and the rest must match literally, against the whole path. An ID the URL does
not contain is shown as "unknown".

On a given URL the first site on the same origin with a matching `paths` entry
is used. biddr.com and numisbids.com are configured.

General values shared by all sites, in [`src/core/config.ts`](../src/core/config.ts):

| Constant | Current value | Meaning |
| --- | --- | --- |
| `ANNOTATION_CLASS` | `minerva-effective-price` | class of the inserted sibling element |
| `UNPARSABLE_TEXT` | `n/a` | shown when the element's text holds no price, or one whose currency is unknown or has no rate |
| `EXCHANGE_RATES_URL` | `https://api.frankfurter.dev/v1/latest` | exchange rates API (ECB reference rates, no key, CORS enabled) |

Changing them in these files is enough - the manifests, the content script, the
background script and the panel all read from them.

Note: a port in `origin` is allowed.
[Match patterns](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns)
cannot contain one, so the manifest entry drops it (the content script is then
injected on every port of that host), but the runtime origin check still
requires the exact port.

## Which saved settings apply

The panel saves the settings under the page's `AuctionKey`: site (`origin`), auction
house and auction ID, as far as the URL tells. Which saved settings a page uses is
decided by `SETTINGS_SCOPES` in
[`src/core/settings/SettingsScope.ts`](../src/core/settings/SettingsScope.ts), tried
in order, the first one holding saved settings wins (and within it the most recently
saved entry):

| Scope | Key parts that must match | Panel highlights (tooltip) |
| --- | --- | --- |
| `auction` | site + auction ID | *Auction* (Saved for this auction.) |
| `house` | site + auction house ID | *House* (Saved for this auction house.) |
| `site` | site | *Site* (Saved for this site.) |

A scope is skipped when one of its key parts is unknown on the page (no auction
house in numisbids URLs, for example). Without any match the page uses the defaults
(`Settings.DEFAULT`) and the panel highlights *Defaults*. Reorder,
add or drop scopes in that list to change the lookup - saving always stores the
full key, so the stored data does not depend on it.

To give a site its own calculation (other fees), write a `PriceCalculator` function (`(amount, currency, settings, rates) => number | undefined`, see `src/core/pricing/PriceCalculator.ts`) and pass it as `calculator` - see [Architecture](architecture.md#controllers-and-their-dependencies).
