# Minerva - Browser assistant for online auctions

*Minerva* is a cross-browser WebExtension to support users in online auctions on platforms such as biddr.com, numisbids.com or l5.com.
It is named after [*Minerva*](https://en.wikipedia.org/wiki/Minerva), the Roman goddess of wisdom, reason, strategy and victory (among other aspects) and should help to make effective prices transparent and achieve a fair bargain.

## Technical Architecture

*Minerva* is a cross-browser WebExtension with a shared core and per-browser packaging.

**Phase 1 scope:** while a configured URL is open, the extension reads the plain
text price and its currency out of a configured element, converts it into the
currency selected in the side panel, adds the auction premium and shipping cost
entered there and appends the resulting effective price as a sibling element
right after it - kept up to date when the price or the settings change. The
side panel also shows the current exchange rates. The target URL and
the selector are configurable in one file - see [Configuration](#configuration).

## Layout

```
src/
  core/        browser-agnostic logic
    config.js      plugin-wide constants
    settings/      Settings (ranges, validation of the panel settings)
    effective-price.js  the effective price calculation
    rates/         ExchangeRates (rates for one base, conversion), RatesClient (Frankfurter / ECB)
    currency/      Currency (the supported currencies: code, symbol, tokens),
                   CurrencyDetector (finds the currency next to a price)
    price.js       price parsing, conversion, re-formatting
    annotation/    PriceAnnotator (reads and prices the elements),
                   AnnotationView (inserts/updates the sibling, idempotent)
    sites/         AuctionSite, SiteRegistry, sites.config.js (the targeted sites),
                   url-matcher.js (glob matching for URLs)
    messages.js    message types
    state/         TabState (what the extension does in a tab: active, counts)
  browser/     the thin browser abstraction (API alias, messaging, settings storage,
               side panel vs. sidebar)
  background/  background script / service worker (BackgroundController, RatesService + wiring)
  content/     content script (ContentController + wiring) + the annotation stylesheet
  panel/       side panel UI (Bootstrap): PanelController, views/, SelectedRates + wiring
platforms/
  chrome/manifest.json     MV3 + `side_panel`, service worker background
  firefox/manifest.json    MV3 + `sidebar_action`, event page background
scripts/       build, packaging, icon generation
test/          node:test unit tests for src/core
icons/         base.png + the PNGs generated from it (npm run icons)
```

Everything a browser does differently is confined to `platforms/*/manifest.json`
and `src/browser/`. `src/core/` never touches an extension API, which is why it
can be unit tested with plain jsdom.

## Configuration

The auction sites the extension acts on live in
[`src/core/sites/sites.config.js`](src/core/sites/sites.config.js): `SITES` holds one
`AuctionSite` per site:

| Field | Example (biddr.com) | Meaning |
| --- | --- | --- |
| `origin` | `https://www.biddr.com` | protocol + host (optionally a port), no path; `<protocol>//<host>/*` is baked into both manifests as the content script match pattern |
| `paths` | `["/*"]` | path globs on that host, e.g. `/live/g-m-auction` or `/live/*`; the extension only acts while the page path matches one of them (`*` = any characters, otherwise exact; query and hash are ignored) |
| `priceSelectors` | `[".current-bid"]` | the elements whose text holds the price |

On a given URL the first site on the same origin with a matching `paths` entry
is used. biddr.com and numisbids.com are configured.

General values shared by all sites, in [`src/core/config.js`](src/core/config.js):

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

## Build

```bash
npm install
npm run build            # both targets -> dist/chrome, dist/firefox
npm run build:chrome     # one target only
npm run watch            # rebuild on change (unminified, inline source maps)
npm test                 # lint + typecheck + unit tests for src/core
npm run format           # apply Prettier and ESLint fixes
npm run package          # zips dist/<target> -> build/<name>-<version>-<target>.zip
```

`scripts/build.mjs` bundles each entry point with esbuild (IIFE - content scripts
cannot be ES modules), copies the static assets plus
`node_modules/bootstrap/dist/css/bootstrap.min.css` into `dist/<target>/vendor/`
and resolves the `$VERSION` / `$CONTENT_MATCHES` placeholders in the manifest.

## Install the development build

**Chrome / Edge**
1. `npm run build:chrome`
2. Open `chrome://extensions`, enable *Developer mode*
3. *Load unpacked* → select `dist/chrome`
4. Click the toolbar icon to open the side panel

**Firefox**
1. `npm run build:firefox`
2. Open `about:debugging#/runtime/this-firefox`
3. *Load Temporary Add-on…* → select `dist/firefox/manifest.json`
4. Click the toolbar icon to toggle the sidebar

`npm run dev:firefox` starts a throwaway Firefox profile with the add-on already
loaded (via `web-ext`), `npm run lint:firefox` runs the AMO validator.

## How it works

- The content script asks `PriceAnnotator` (`src/core/annotation/`) to reconcile the page whenever
  it loads, the DOM changes (`MutationObserver` on `childList` **and**
  `characterData`, so late-rendered elements and in-place price edits are both
  caught) or the background script reports a URL change.
- For every match, the element's text is parsed by `src/core/price.js`, the
  effective price is calculated by `calculateEffectivePrice()` in
  `src/core/effective-price.js` (price converted into the selected currency,
  plus premium, plus shipment), and the result is inserted as a sibling right
  after the
  price element (same tag, class `minerva-effective-price`, `aria-live="polite"`). The
  price element itself is never modified. Re-running is idempotent: the
  annotation is only written when its text actually changes, so the extension's
  own DOM writes cannot drive the observer in circles.
- The input currency is read from the price text: `EUR`/`USD`/`GBP`/`CHF` as a
  standalone code, or `€`, `$`, `US$`, `£`, `Fr.`, `SFr.`; the one closest to
  the number wins (prefix before suffix).
- When the text holds no parsable price (`sold out`, an empty element, a value
  the page has not filled in yet), or its currency is missing, unsupported or
  has no exchange rate (`500`, `¥500`, foreign prices before any rates were
  saved), the sibling is still inserted and shows
  `UNPARSABLE_TEXT` (`n/a`), flagged with `data-minerva-unparsable` and greyed out by
  `content.css`. It turns back into a real amount as soon as the text becomes a
  price again, and vice versa. Annotations are only dropped when the URL stops
  matching.
- Prices are given back in the notation they came in - currency position,
  decimal and grouping separators and surrounding text are preserved; only the
  currency is swapped (a symbol for a symbol, a code for a code):

  | in | out (EUR, 1 USD = 0.5 EUR, +100 shipment) |
  | --- | --- |
  | `500 EUR` | `600 EUR` |
  | `USD 1.359` | `EUR 779,50` |
  | `$49.99` | `€125.00` |
  | `1.234,56 EUR` | `1.334,56 EUR` |
  | `500` | `n/a` (no currency) |

  A single separator followed by exactly three digits is read as grouping
  (`1.359` = 1359), anything else as a decimal separator (`1.35` = 1.35).
- The background script watches `tabs.onUpdated` (covers SPA `pushState`
  navigation), sets a badge on the toolbar icon and relays sync requests.
- The panel is one HTML file used by both browsers - Chrome shows it via
  `chrome.sidePanel`, Firefox via `sidebar_action`. It shows the saved settings;
  *Save* persists them together with the matching exchange rates in one write to
  `storage.local` (`settings`, `exchangeRates`) and makes the active tab
  recalculate right away; other open tabs follow via `storage.onChanged`. An
  emptied input keeps the saved value.
- Selecting a currency (EUR, USD, GBP, CHF; default EUR) immediately updates the
  shipment's currency hint and loads the rates against the other three from the
  Frankfurter API (through the background script); they are listed in the
  *Plugin status* card and saved with the currency. The background refreshes the
  saved rates on install/update, on browser start and once a day. Until rates for the
  saved currency have been stored once, only prices already in that currency
  are converted; all others show `n/a`.

## Verified

Before the switch from the +20% surcharge to the shipment setting, built
artifacts were smoke tested against a local fixture page in real browsers
(Firefox via geckodriver, Chrome 145 via CDP), with identical results in both:
`500 EUR` gets a `600 EUR` sibling and a late-rendered `USD 1.359` gets
`USD 1.630,80`; changing the price text in place to `1.234,56 EUR` updates the
sibling to `1.481,47 EUR`; an element reading `sold out` gets an `n/a` sibling,
and swapping the two texts swaps the siblings accordingly, with zero DOM churn
once settled; the annotations disappear on a non-matching URL and come back
after a `history.pushState` into the target URL.

## Plans & Next Steps
* Clean up and design consolidation
* Logo
* Disclaimer and Bug reporting link
* Persistence
* Clearer distinction of effective price
* URL-based auction detection & persistence in auction scope
* Backend: Auction database
* Tweak "your bid" price, too