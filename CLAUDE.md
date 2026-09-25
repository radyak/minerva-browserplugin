# CLAUDE.md

Minerva — a cross-browser (Chrome + Firefox) MV3 WebExtension that reads the price out of a
configured element on a configured auction site, calculates the effective price from the
settings entered in the side panel and inserts the result as a sibling element next to it. The
side panel shows status and exchange rates and holds the persisted auction premium, shipment
and currency inputs.

`README.md` documents the user-facing behaviour, the price-format table and the install steps.
This file covers what is needed to change the code safely.

## Commands

```bash
npm install
npm test                 # node:test + jsdom, src/core only — fast, run this after any core change
npm run build            # -> dist/chrome and dist/firefox
npm run build:chrome     # or :firefox
npm run watch            # rebuild on change, unminified + inline sourcemaps
npm run package          # zip dist/<target> -> build/<name>-<version>-<target>.zip
npm run icons            # regenerate icons/*.png
npm run dev:firefox      # web-ext run against dist/firefox (throwaway profile)
npm run lint:firefox     # AMO validator
```

There is no linter or formatter for the source itself — match the surrounding style
(2-space indent, double quotes, semicolons, JSDoc block comments on every exported function).

## Architecture invariants

- **`src/core/` never touches an extension API.** It works against a plain `Document` and plain
  strings, which is the only reason it can be unit tested with jsdom. Anything needing
  `chrome.*`/`browser.*` goes through `src/platform/browser.js` (the `ext` alias) and is imported
  from `content/`, `background/` or `panel/`.
- **Browser differences are confined to two places:** `platforms/<target>/manifest.json` and
  `src/platform/panel.js` (Chrome `sidePanel` vs. Firefox `sidebarAction`). Do not add a
  `TARGET === "chrome"` branch anywhere else; extend `src/platform/` instead.
- **`src/core/config.js` is the single source of truth.** Sites are entries of the `PLATFORMS`
  array (`platformUrl`, `platformPaths`, `targetSelectors`); the remaining
  constants are plugin-wide. The manifests carry `$VERSION` and `$CONTENT_MATCHES` placeholders
  that `scripts/build.mjs` resolves from `package.json` and from every platform's `platformUrl`
  (via `matchPatternFor()`).
  Changing what the extension targets should mean editing only `config.js`.
- **`__TARGET__` is an esbuild `define`,** not a runtime variable. It only exists inside the three
  bundled entry points (`background`, `content`, `panel/panel`). Importing a module that reads it
  from a test will throw — that is another reason core code stays free of `src/platform/`.
- **Bundles are IIFE, not ESM** (`format: "iife"` in `scripts/build.mjs`): content scripts and the
  Firefox event page cannot be ES modules. Adding a new entry point means adding it to
  `entryPoints` there, and any new static file to `copyStaticAssets()`.

## Things that bite

- **The annotator must stay idempotent.** `annotateElements()` only writes to the DOM when the
  text/dataset actually changes, because the content script's `MutationObserver` watches
  `childList` **and** `characterData` on the whole document. An unconditional write turns into an
  infinite observer loop. Any new DOM write needs the same "only on change" guard.
- **Never annotate our own output** — the loop skips elements carrying `ANNOTATION_CLASS`, which
  matters because `targetSelectors` are site selectors that may well match the sibling too.
  The same goes for the *text*: when matches are nested (`span:first-child` inside
  `span:first-child`), only the innermost one is annotated and wrappers lose any annotation, and
  the price text is read without our annotations (`priceText()`). Otherwise the wrapper reads
  "750 GBP1207.72 USD" and shows the price repeatedly.
- **`platformUrl` is protocol + host only, `platformPaths` are path globs only.** A URL is on a
  platform when its origin equals `platformUrl`'s origin and its *pathname* (query/hash ignored)
  matches one of the paths via our tiny glob matcher (`src/core/url-matcher.js`, `*` only, exact
  otherwise). `matchPatternFor()` derives the manifest match pattern `<protocol>//<host>/*` and
  drops any port, since match patterns cannot carry one; the origin check still enforces it.
- **`test/annotator.test.mjs` runs against its own `TEST_PLATFORMS`** (`findPlatform`,
  `syncDocument` and `isTargetUrl` take an optional `platforms` argument defaulting to
  `PLATFORMS`), so the real config can change freely. The real `PLATFORMS` only gets a shape
  check (required fields, `platformUrl` without path, paths start with `/`, selectors parse as
  CSS).
- **Price formatting mirrors the input notation** (currency position, decimal/grouping separators,
  surrounding text). The one ambiguous rule: a single separator followed by exactly three digits
  is read as *grouping* (`1.359` = 1359), anything else as a decimal separator (`1.35` = 1.35).
  The currency token closest to the number (`src/core/currency.js`) is the input currency and is
  the only part swapped on output. Change `src/core/price.js` or `currency.js` only with a
  matching case added to `test/price.test.mjs`.
- `dist/`, `build/` and `.poc/` are gitignored. `.poc/` holds unrelated reference extensions
  (Mozilla samples etc.) — not part of the build, safe to ignore.

## Settings and the effective price

- The panel writes its inputs to `storage.local` under `SETTINGS_STORAGE_KEYS`
  (`src/core/settings.js`) only when Save is clicked; empty inputs are skipped (they keep and
  show the stored value). The content script reads them with `readSettings()` (which falls back
  to `DEFAULT_SETTINGS` for empty/invalid values). There is no message for settings — storage is
  the channel: after saving, the panel sends `GET_ACTIVE_STATE`, the background forwards
  `SYNC_REQUEST`, and the content script **re-reads the settings on every `SYNC_REQUEST`** before
  syncing. `storage.onChanged` additionally updates the other open tabs.
- The calculation lives in `calculateEffectivePrice(amount, currency, settings, rates)`
  (`src/core/effective-price.js`) and is passed to `annotateElements()` as `calculate`, so it can
  later be made per-platform: `amount * rates[currency] * (1 + auctionPremium / 100) + shipment`,
  in `settings.currency`. `currency` is the input currency read from the price text, `rates` is a
  `ConversionRates` map (input currency → factor into the output currency). A missing currency
  or rate returns `undefined`, which `convertPrice()` turns into `null` and the annotator into
  `n/a` — no guessing, no fallback rate.
- `rates` comes from `conversionRates(storedExchangeRates, settings.currency)`: the panel stores
  the fetched `ExchangeRates` (for base = selected currency) under `EXCHANGE_RATES_STORAGE_KEY`
  on Save and whenever it opens; the content script inverts them. Stored rates for another base
  are ignored, so only the output currency itself (1:1) is known until matching rates exist.
- Exchange rates are fetched by the panel only (`src/core/exchange-rates.js`, plain `fetch` with
  an injectable fetch function for tests) from Frankfurter (`EXCHANGE_RATES_URL` in
  `config.js`). It sends `Access-Control-Allow-Origin: *`, so no `host_permissions` are needed.
  The panel renders only the latest request, so fast currency switches cannot show stale rates.

## Message flow

Three types only, in `src/core/messages.js`:

- background → content: `SYNC_REQUEST` on `tabs.onUpdated` (fires for SPA `pushState` too, which
  is how in-page navigation is caught); content also self-syncs on load, `popstate`, `hashchange`
  and DOM mutations (coalesced to one run per animation frame).
- content → background/panel: `STATE_CHANGED`, only when `active`/`annotated`/`unparsable`
  actually changed. Background turns it into the toolbar badge.
- panel → background: `GET_ACTIVE_STATE`, answered asynchronously (the listener returns `true` to
  keep the channel open — required, easy to drop when editing).

## Conventions

- Conventional-commit subjects (`feat:`, `fix:`). Commits authored by AI are marked in the
  subject, e.g. `feat: [by AI] Convert price live on page` — keep that marker.
- Verifying a change usually means `npm test` plus, for anything touching the content or
  background script, a real build loaded into a browser (`npm run dev:firefox` is the quickest).
