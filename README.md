# Browser Plugin

Cross-browser WebExtension with a shared core and per-browser packaging.

**Phase 1 scope:** while a configured URL is open, the extension reads the plain
text price out of a configured element, adds 20% and appends the result as a
sibling element right after it - kept up to date when the price changes. A side
panel with a single text input can be opened next to the page. The URL and the
selector are **placeholders** - see [Configuration](#configuration).

## Layout

```
src/
  core/        browser-agnostic logic
    config.js      placeholders and the surcharge rate
    price.js       price parsing, surcharge, re-formatting
    annotator.js   reads the element, inserts/updates the sibling
    url-matcher.js glob matching for URLs
    messages.js    message types
  platform/    the thin browser abstraction (API alias, side panel vs. sidebar)
  background/  background script / service worker
  content/     content script + the annotation stylesheet
  panel/       side panel UI (Bootstrap)
platforms/
  chrome/manifest.json     MV3 + `side_panel`, service worker background
  firefox/manifest.json    MV3 + `sidebar_action`, event page background
scripts/       build, packaging, icon generation
test/          node:test unit tests for src/core
icons/         generated PNGs (npm run icons)
```

Everything a browser does differently is confined to `platforms/*/manifest.json`
and `src/platform/`. `src/core/` never touches an extension API, which is why it
can be unit tested with plain jsdom.

## Configuration

All placeholders live in [`src/core/config.js`](src/core/config.js):

| Constant | Placeholder value | Meaning |
| --- | --- | --- |
| `CONTENT_SCRIPT_MATCHES` | `https://example.com/*` | where the content script is injected; baked into both manifests at build time |
| `TARGET_URL_PATTERN` | `https://example.com/app/dashboard*` | the extension only acts while the URL matches this glob (`*` = any characters) |
| `TARGET_SELECTOR` | `#app-root .content-card[data-module="overview"]` | the element whose text holds the price |
| `MARKUP_RATE` | `0.2` | surcharge added to the parsed price (+20%) |
| `ANNOTATION_CLASS` | `xbp-price-markup` | class of the inserted sibling element |
| `UNPARSABLE_TEXT` | `n/a` | shown when the element's text holds no price |

Changing them in that one file is enough - the manifests, the content script and
the background script all read from it.

Note: `CONTENT_SCRIPT_MATCHES` entries must be valid
[match patterns](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Match_patterns),
which cannot contain a port. Put the port in `TARGET_URL_PATTERN` instead, it is
matched by our own glob matcher.

## Build

```bash
npm install
npm run build            # both targets -> dist/chrome, dist/firefox
npm run build:chrome     # one target only
npm run watch            # rebuild on change (unminified, inline source maps)
npm test                 # unit tests for src/core
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

- The content script asks `src/core/annotator.js` to reconcile the page whenever
  it loads, the DOM changes (`MutationObserver` on `childList` **and**
  `characterData`, so late-rendered elements and in-place price edits are both
  caught) or the background script reports a URL change.
- For every match, the element's text is parsed by `src/core/price.js`, the
  surcharge is applied, and the result is inserted as a sibling right after the
  price element (same tag, class `xbp-price-markup`, `aria-live="polite"`). The
  price element itself is never modified. Re-running is idempotent: the
  annotation is only written when its text actually changes, so the extension's
  own DOM writes cannot drive the observer in circles.
- When the text holds no parsable price (`sold out`, an empty element, a value
  the page has not filled in yet), the sibling is still inserted and shows
  `UNPARSABLE_TEXT` (`n/a`), flagged with `data-xbp-unparsable` and greyed out by
  `content.css`. It turns back into a real amount as soon as the text becomes a
  price again, and vice versa. Annotations are only dropped when the URL stops
  matching.
- Prices are given back in the notation they came in - currency position,
  decimal and grouping separators and surrounding text are preserved:

  | in | out (+20%) |
  | --- | --- |
  | `500 EUR` | `600 EUR` |
  | `USD 1.359` | `USD 1.630,80` |
  | `€49.99` | `€59.99` |
  | `1.234,56 EUR` | `1.481,47 EUR` |
  | `CHF 1'200` | `CHF 1'440` |

  A single separator followed by exactly three digits is read as grouping
  (`1.359` = 1359), anything else as a decimal separator (`1.35` = 1.35).
- The background script watches `tabs.onUpdated` (covers SPA `pushState`
  navigation), sets a badge on the toolbar icon and relays sync requests.
- The panel is one HTML file used by both browsers - Chrome shows it via
  `chrome.sidePanel`, Firefox via `sidebar_action`. Its input is persisted to
  `storage.local`.

## Verified

Built artifacts were smoke tested against a local fixture page in real browsers
(Firefox via geckodriver, Chrome 145 via CDP), with identical results in both:
`500 EUR` gets a `600 EUR` sibling and a late-rendered `USD 1.359` gets
`USD 1.630,80`; changing the price text in place to `1.234,56 EUR` updates the
sibling to `1.481,47 EUR`; an element reading `sold out` gets an `n/a` sibling,
and swapping the two texts swaps the siblings accordingly, with zero DOM churn
once settled; the annotations disappear on a non-matching URL and come back
after a `history.pushState` into the target URL.
