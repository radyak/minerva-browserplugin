# Configuration

The auction sites the extension acts on live in
[`src/core/sites/sites.config.js`](../src/core/sites/sites.config.js): `SITES` holds one
`AuctionSite` per site:

| Field | Example (biddr.com) | Meaning |
| --- | --- | --- |
| `origin` | `https://www.biddr.com` | protocol + host (optionally a port), no path; `<protocol>//<host>/*` is baked into both manifests as the content script match pattern |
| `paths` | `["/*"]` | path globs on that host, e.g. `/live/g-m-auction` or `/live/*`; the extension only acts while the page path matches one of them (`*` = any characters, otherwise exact; query and hash are ignored) |
| `priceSelectors` | `[".current-bid"]` | the elements whose text holds the price |
| `ids` | `{ house: UrlParam.path("/:id/auction"), auction: UrlParam.query("a") }` | where the page URL names the auction house *(optional)* and the auction; shown in the *Plugin status* card |
| `calculator` | *(optional)* | a `PriceCalculator` for sites whose fees differ; `EffectivePriceCalculator` by default |

An ID is read by a `UrlParam` (`src/core/sites/UrlParam.js`), either from a query
parameter - `UrlParam.query("a")` reads `7522` from `?a=7522` - or from one path
segment - `UrlParam.path("/sale/:id*")` reads `7123` from `/sale/7123/lot/45`. In
a path pattern `:id` marks the segment (exactly once), `*` matches any characters
and the rest must match literally, against the whole path. An ID the URL does
not contain is shown as "unknown".

On a given URL the first site on the same origin with a matching `paths` entry
is used. biddr.com and numisbids.com are configured.

General values shared by all sites, in [`src/core/config.js`](../src/core/config.js):

| Constant | Current value | Meaning |
| --- | --- | --- |
| `ANNOTATION_CLASS` | `minerva-effective-price` | class of the inserted sibling element |
| `UNPARSABLE_TEXT` | `n/a` | shown when the element's text holds no price |
| `EXCHANGE_RATES_URL` | `https://api.frankfurter.dev/v1/latest` | exchange rates API (ECB reference rates, no key, CORS enabled) |

Changing them in these files is enough - the manifests, the content script and
the background script all read from them.

Note: a port in `origin` is allowed.
[Match patterns](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns)
cannot contain one, so the manifest entry drops it (the content script is then
injected on every port of that host), but the runtime origin check still
requires the exact port.

To give a site its own calculation (other fees), subclass `PriceCalculator` (`src/core/pricing/`) and pass an instance as `calculator` - see [Architecture](architecture.md#controllers-and-their-dependencies).
