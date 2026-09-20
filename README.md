# Browser Plugin

Cross-browser WebExtension with a shared core and per-browser packaging.

**Phase 1 scope:** while a configured URL is open, a configured element gets a red
marker; a side panel with a single text input can be opened next to the page.
The URL and the selector are **placeholders** - see [Configuration](#configuration).

## Layout

```
src/
  core/        browser-agnostic logic (config, URL matching, DOM marking, message types)
  platform/    the thin browser abstraction (API alias, side panel vs. sidebar)
  background/  background script / service worker
  content/     content script + the marker stylesheet
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
| `TARGET_URL_PATTERN` | `https://example.com/app/dashboard*` | the extension only marks while the URL matches this glob (`*` = any characters) |
| `TARGET_SELECTOR` | `#app-root .content-card[data-module="overview"]` | the element that gets the red marker |

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

- The content script asks `src/core/marker.js` to reconcile the page whenever it
  loads, the DOM changes (`MutationObserver`, so late-rendered elements are
  caught) or the background script reports a URL change.
- Marked elements get the class `xbp-marked`; `src/content/content.css` renders
  it as a red `outline`, which is visually a border but does not shift the
  page's layout.
- The background script watches `tabs.onUpdated` (covers SPA `pushState`
  navigation), sets a badge on the toolbar icon and relays sync requests.
- The panel is one HTML file used by both browsers - Chrome shows it via
  `chrome.sidePanel`, Firefox via `sidebar_action`. Its input is persisted to
  `storage.local`.

## Verified

Built artifacts were smoke tested against a local fixture page in real browsers
(Firefox 14x via geckodriver, Chrome 145 via CDP): the target element - including
one rendered 300 ms late - is marked on the target URL, unmarked on a
non-matching URL, and re-marked after a `history.pushState` back into the target
URL.
