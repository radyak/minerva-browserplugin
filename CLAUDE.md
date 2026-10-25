# CLAUDE.md

Minerva — a cross-browser (Chrome + Firefox) MV3 WebExtension that reads the price out of a
configured element on a configured auction site, calculates the effective price from the
settings entered in the side panel and inserts the result as a sibling element next to it. The
side panel shows status and exchange rates and holds the persisted auction premium, shipment
(in the auction's currency) and currency inputs.

`README.md` is the entry point; the chapters live in `docs/` (`how-it-works.md`: user-facing
behaviour and the price-format table, `architecture.md`: components, messages, storage and event
lifecycles with Mermaid diagrams, `configuration.md`, `development.md`: build and install steps;
`dev/architecture-review.md`: the review behind the refactoring, `dev/wxt-migration-plan.md`:
the switch to WXT). Keep `docs/architecture.md` in
sync when components, messages, storage keys or listeners change. This file covers what is needed
to change the code safely.

## Commands

```bash
npm install
npm test                 # lint + typecheck + unit tests — run this after any change
npm run test:unit        # node:test + jsdom, src/core only — fast
npm run lint             # ESLint + Prettier check
npm run format           # Prettier + ESLint --fix
npm run typecheck        # tsc checkJs over the JSDoc types (non-strict, jsconfig.json)
npm run build            # wxt build -> dist/chrome and dist/firefox
npm run build:chrome     # or :firefox
npm run dev              # WXT dev mode, Chrome: dist/chrome-dev, auto-reload, throwaway profile
npm run dev:firefox      # the same for Firefox (dist/firefox-dev)
npm run package          # wxt zip -> dist/<name>-<version>-<browser>.zip (+ AMO sources zip)
npm run icons            # scale icons/base.png to public/icons/icon-{16,32,48,64,128}.png (sharp)
npm run lint:firefox     # AMO validator
```

Formatting is Prettier (`.prettierrc.json`, width 100; Markdown is excluded and formatted by
hand), linting is ESLint's recommended set (`eslint.config.js`). Types are the JSDoc comments,
checked by `tsc` via `jsconfig.json`, which includes WXT's generated `.wxt/wxt.d.ts`
(`import.meta.env`, CSS imports; `npm run typecheck` runs `wxt prepare` first). Keep JSDoc block comments on every exported function.

## Architecture invariants

- **`src/core/` never touches an extension API.** It works against a plain `Document` and plain
  strings, which is the only reason it can be unit tested with jsdom. Anything needing
  `chrome.*`/`browser.*` goes through `src/browser/` (the `ext` alias in `ext.js`, messaging in
  `MessageBus.js`) and is imported from `content/`, `background/` or `panel/`. Classes in
  `src/browser/` take `ext` as a constructor argument, so they are testable with a fake one.
- **Browser differences are confined to two places:** the `manifest` function in
  `wxt.config.js` (only `browser_specific_settings` for Firefox; WXT itself emits `side_panel`
  vs. `sidebar_action` and the background key per browser) and `src/browser/side-panel.js`
  (Chrome `sidePanel` vs. Firefox `sidebarAction`). Do not add an
  `import.meta.env.BROWSER === "chrome"` branch anywhere else; extend `src/browser/` instead.
- **`src/core/sites/sites.config.js` is the single source of truth for the targets.** `SITES` is
  a `SiteRegistry` of `AuctionSite`s (`origin`, `paths`, `priceSelectors`, `ids` for the house
  and auction ID in the URL, read by `UrlParam`); plugin-wide constants
  live in `src/core/config.js`. WXT takes the version from `package.json`; the content script's
  `matches` (`src/entrypoints/content.js`) and the `host_permissions` (`wxt.config.js`) both
  come from `SITES.matchPatterns()`, read at build time. Changing what the extension targets
  should mean editing only `sites.config.js`.
- **Auction sites are always "sites"**, never "platforms"; the browsers are "browsers" (WXT's
  `-b chrome|firefox`).
- **`import.meta.env.BROWSER` is replaced at build time,** not a runtime variable, and only
  exists in code bundled by WXT. `src/browser/ext.js` re-exports `browser` from `wxt/browser`,
  which tests cannot load — that is another reason core code stays free of `src/browser/`, and
  why tests inject a fake `ext` instead.
- **Entry points only wire things up.** They live in `src/entrypoints/` (WXT's `srcDir` is
  `src`): `content.js` (`defineContentScript`), `background.js` (`defineBackground`) and
  `sidepanel/main.js` (+ `index.html`) create a `ContentController` / `BackgroundController` /
  `PanelController`
  with the real `window`/`ext`/`document`, `MessageBus` and `SettingsStore`; all behaviour lives
  in the controllers, which get their dependencies through the constructor and are tested with
  jsdom and the fakes in `test/support/fakes.mjs`. Controllers never import
  `src/browser/ext.js` (it imports `wxt/browser`). Nothing may run at an entry point's top
  level besides imports: WXT imports `content.js` and `background.js` in Node at build time to
  read their options, so all wiring sits inside `main()` / the `defineBackground` callback.
  The panel's DOM work is split into views (`src/panel/views/`: settings form, status badge,
  auction IDs and settings source on top, "no auction" notice, rates for the active tab's price
  currencies); the form and the IDs are only shown while `TabState#onAuction` (active with a
  house or auction ID). Its test runs against the real `src/entrypoints/sidepanel/index.html`.
- **WXT config (`wxt.config.js`):** `imports: false` — no auto-imports, every module imports
  `defineBackground` etc. explicitly (`wxt/utils/define-background`), so files stay loadable by
  `node --test`; `manifestVersion: 3` for both browsers (WXT defaults Firefox to MV2). A new entry
  point is a new file in `src/entrypoints/` following WXT's naming; files that go into the build
  as they are belong in `public/` (the icons). Content script and background are bundled as IIFE
  (WXT's default — they cannot be ES modules), the side panel page as ES module. Bootstrap and
  `panel.css` are imported from `sidepanel/main.js`; the Firefox sidebar's title and icon come
  from `<meta name="manifest.…">` tags in `index.html`.
- **`content.css` inlines its PNGs:** the content entry point imports it, WXT lists it under
  `content_scripts[].css`, and `assetsInlineLimit` in `wxt.config.js` forces the PNGs it
  references inline as `data:` URLs — content-script CSS cannot use relative URLs into the
  extension, and this avoids `web_accessible_resources` and a per-browser
  `chrome-extension://`/`moz-extension://` URL. It references the source file
  (`../../public/icons/icon-64.png`), not `/icons/…`, which Vite would leave as a page URL.

## Things that bite

- **The annotator must stay idempotent.** `AnnotationView` (`src/core/annotation/`) is the only
  class that writes to the page, and it only writes when the text/dataset actually changes,
  because the content script's `MutationObserver` watches `childList` **and** `characterData` on
  the whole document. An unconditional write turns into an infinite observer loop. Any new DOM
  write belongs into `AnnotationView`, with the same "only on change" guard. `PriceAnnotator`
  decides *what* to show (wrapper rule, pricing).
- **Never annotate our own output** — `AnnotationView.query()` skips elements carrying
  `ANNOTATION_CLASS` (`minerva-effective-price`), which matters because `priceSelectors` are site
  selectors that may well match the sibling too.
  The same goes for the *text*: when matches are nested (`span:first-child` inside
  `span:first-child`), only the innermost one is annotated and wrappers lose any annotation, and
  the price text is read without our annotations (`priceText()`). Otherwise the wrapper reads
  "750 GBP1207.72 USD" and shows the price repeatedly.
- **`priceSelectors` must not count from the end** (`:last-child`, `:last-of-type`,
  `:only-child`, `:nth-last-…`): the annotation is inserted right after the price element, so
  such a selector stops matching it from the second run on (`test/sites.test.mjs` rejects them).
  Count from the start instead (`:nth-child(2)`). Annotations whose element is no longer
  annotated are removed on every run (`AnnotationView#removeAllBut()`), so a lost match shows
  as a missing annotation, never as a stale amount.
- **`origin` is protocol + host only, `paths` are path globs only.** A URL is on a site
  (`AuctionSite.matches()`) when its origin equals the site's `origin` and its *pathname*
  (query/hash ignored) matches one of the paths via our tiny glob matcher
  (`src/core/sites/url-matcher.js`, `*` only, exact otherwise). `matchPatternFor()` derives the
  manifest match pattern `<protocol>//<host>/*` and drops any port, since match patterns cannot
  carry one; the origin check still enforces it.
- **The tests run against their own `SiteRegistry`s** (`ContentController` takes an optional
  `sites` argument defaulting to `SITES`), so the real config can change freely. The real `SITES`
  only gets a shape check in `test/sites.test.mjs` (`origin` without path, paths start with `/`,
  selectors parse as CSS).
- **Price formatting mirrors the input notation** (currency position, decimal/grouping separators,
  surrounding text). The one ambiguous rule: a single separator followed by exactly three digits
  is read as *grouping* (`1.359` = 1359), anything else as a decimal separator (`1.35` = 1.35).
  The currency token closest to the number (`CurrencyDetector`) is the input currency and is
  the only part swapped on output. Change `src/core/price.js` or `src/core/currency/` only with a
  matching case added to `test/price.test.mjs` or `test/currency.test.mjs`.
- **`Currency.ALL` (`src/core/currency/Currency.js`) is the one list of supported currencies:**
  code, output symbol and the tokens recognised in page text. Detection, the panel's currency
  options and the exchange rates request are all derived from it.
- `dist/`, `.wxt/`, `.output/` and `.poc/` are gitignored. `.wxt/` is generated by `wxt prepare`
  (also run on `npm install`). `.poc/` holds unrelated reference extensions
  (Mozilla samples etc.) — not part of the build, safe to ignore.

## Settings and the effective price

- **All storage goes through `SettingsStore` (`src/browser/SettingsStore.js`).** The layout is
  `{ auctionSettings: SettingsBook#toJSON(), exchangeRates: { [base]: ExchangeRates#toJSON() } }`;
  `load()` returns the `SettingsBook` and the rates per currency. `save(key, settings, rates)`
  writes both in **one** `storage.local.set`, so listeners get one change event and never see new
  settings without their rates. Older layouts (the global `settings` key of 0.1.0, the
  one-key-per-setting keys before it) are converted once by `migrate(sites)`, called from the
  background on `runtime.onInstalled`: global settings become site-wide entries of every site.
- **Settings are saved per auction.** `SettingsBook` (`src/core/settings/`) holds one entry per
  `AuctionKey` (site origin + house + auction ID, as `TabState` carries them; `null` = unknown),
  newest last. `resolve(key)` walks `SETTINGS_SCOPES` (`SettingsScope.js`: auction > house > site,
  each a list of key fields that must be equal) and returns the newest entry of the first scope
  with one, or `null` - then `Settings.DEFAULT` applies. A scope is skipped when one of its fields
  is unknown on the page, so unknown IDs never match each other. The lookup order lives only in
  `SETTINGS_SCOPES`; saving always stores the full key. The content script resolves on every
  `sync()` (so URL changes switch settings), the panel when the active tab's `AuctionKey` changes.
- The panel shows the resolved settings and saves the full `Settings` under the active tab's key
  when Save is clicked; an emptied input keeps the value shown. The input ranges live in
  `Settings.RANGES` only; the panel sets its inputs' `min`/`max` from them. There is no message for settings — storage is
  the channel: after saving, the panel sends `GET_ACTIVE_STATE`, the background forwards
  `SYNC_REQUEST`, and the content script **re-reads the settings on every `SYNC_REQUEST`** before
  syncing. `SettingsStore.onChange()` additionally updates the other open tabs.
- **The calculation is per site:** every `AuctionSite` has a `calculator`, a `PriceCalculator`
  (`src/core/pricing/`) whose `calculate(amount, currency, settings, rates)` `PriceAnnotator`
  uses for that site's prices. The default is `EffectivePriceCalculator`:
  `rates.convert(amount * (1 + auctionPremium / 100) + shipment, currency)`, in
  `settings.currency`. The shipment is entered in the auction's currency (the price's, not
  `settings.currency`), so it is converted together with the price; the panel shows the
  `TabState#currencies` next to it. A site with different fees gets a subclass, passed as `calculator` in
  `sites.config.js`. `currency` is the input currency read from the price text,
  `rates` an `ExchangeRates` with `settings.currency` as base. A missing currency or rate returns
  `undefined`, which `convertPrice()` turns into `null` and the annotator into `n/a` — no
  guessing, no fallback rate.
- **`ExchangeRates` (`src/core/rates/ExchangeRates.js`) is the only place that knows the rate
  direction:** `rates[code]` is "1 base = x code", `factorFrom(code)`/`convert()` go the other way
  (code → base). It drops invalid entries on construction and is immutable.
- **The background owns the exchange rates** (`RatesService` in `src/background/`, the only user
  of `RatesClient`). It answers the panel's `GET_RATES` (reusing fetched rates for an hour) and
  keeps the saved rates fresh: on install/update, on browser start and via a daily `alarms`
  alarm (`refresh-exchange-rates`; re-created on start because Firefox drops alarms on restart).
  A refresh covers every currency of the saved settings plus `Settings.DEFAULT.currency` (used
  where nothing saved applies), each saved on its own.
- The panel displays the rates it gets from the background and saves them together with the
  settings on Save (one write, see above). `SelectedRates` (`src/panel/`) lets only the latest
  request count, so fast currency switches cannot show or store stale rates. Rates are stored
  per base currency; without stored rates for a currency only the output currency itself (1:1)
  is known.
- Rates come from Frankfurter (`EXCHANGE_RATES_URL` in `config.js`, plain `fetch` with an
  injectable fetch function for tests). It sends `Access-Control-Allow-Origin: *`, so no
  `host_permissions` are needed.

## Message flow

Four types only, in `src/core/messages.js`:

- background → content: `SYNC_REQUEST` on `tabs.onUpdated` (fires for SPA `pushState` too, which
  is how in-page navigation is caught); content also self-syncs on load, `popstate`, `hashchange`
  and DOM mutations (coalesced to one run per animation frame).
- content → background/panel: `STATE_CHANGED`, only when the `TabState` actually changed
  (`equals()`). Background turns it into the toolbar badge.
- panel → background: `GET_ACTIVE_STATE`, answered asynchronously.
- panel → background: `GET_RATES` (`base`), answered with `{ rates }` (`ExchangeRates#toJSON()`)
  or `{ error }`.

Listen with `MessageBus.on(type, handler)`, never `runtime.onMessage` directly: the handler
returns its answer (or a promise of it, `undefined` for none) and the bus returns `true` to keep
the channel open when needed — required for async answers and easy to drop by hand. Send with
`bus.send()` / `bus.sendToTab()`, which ignore a missing receiver.

The state of a tab is a `TabState` (`src/core/state/TabState.js`: `active`, `annotated`,
`unparsable`, `currencies` of the prices found, `site` origin, `house`/`auction` IDs). Messages are
structured-cloned, so class instances do not survive them: send `{ ...state.toJSON(), url }`, and
turn what arrives back into one with `TabState.from()`.

## Conventions

- Conventional-commit subjects (`feat:`, `fix:`). Commits authored by AI are marked in the
  subject, e.g. `feat: [by AI] Convert price live on page` — keep that marker.
- Verifying a change usually means `npm test` plus, for anything touching the content or
  background script, a real build loaded into a browser (`npm run dev:firefox` is the quickest).
