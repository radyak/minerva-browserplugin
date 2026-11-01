# CLAUDE.md

Minerva — a cross-browser (Chrome + Firefox) MV3 WebExtension that reads the price out of a
configured element on a configured auction site, calculates the effective price from the
settings entered in the side panel and inserts the result as a sibling element next to it. The
side panel shows status and exchange rates and holds the persisted auction premium, shipment
(in the auction's currency) and currency inputs.

`README.md` is the entry point; the chapters live in `docs/` (`how-it-works.md`: user-facing
behaviour and the price-format table, `architecture.md`: components, messages, storage and event
lifecycles with Mermaid diagrams, `configuration.md`, `development.md`: build and install steps;
`dev/framework-and-simplification-review.md`: the simplifications and the React panel; finished
plans are kept in `dev/archive/`). Keep `docs/architecture.md` in sync when components, messages,
storage keys or listeners change. This file covers what is needed to change the code safely.

## Commands

```bash
npm install
npm test                 # lint + typecheck + unit tests — run this after any change
npm run test:unit        # Vitest: all tests, ~1 s (npm run test:watch to keep it running)
npm run lint             # ESLint + Prettier check
npm run format           # Prettier + ESLint --fix
npm run typecheck        # tsc: src/ strict (tsconfig.json), tests non-strict (test/tsconfig.json)
npm run build            # wxt build -> dist/chrome and dist/firefox (VERSION=1.2.3 sets the
                         # version shown in the panel, default 0.0.0-dev; CI sets it)
npm run build:chrome     # or :firefox
npm run dev              # WXT dev mode, Chrome: dist/chrome-dev, auto-reload, throwaway profile
npm run dev:firefox      # the same for Firefox (dist/firefox-dev)
npm run package          # wxt zip -> dist/<name>-<version>-<browser>.zip (+ AMO sources zip)
npm run lint:firefox     # AMO validator
```

Formatting is Prettier (`.prettierrc.json`, width 100; Markdown is excluded and formatted by
hand), linting is ESLint's recommended set plus `typescript-eslint`'s for `.ts` (`eslint.config.js`).

## TypeScript

- **`src/` and `wxt.config.ts` are TypeScript, strict** (`tsconfig.json` extends WXT's generated
  `.wxt/tsconfig.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `verbatimModuleSyntax`; `npm run typecheck` runs `wxt prepare` first). **The tests are
  TypeScript too** (`test/*.test.ts`), checked by `test/tsconfig.json` without `strict`; the
  fakes in `test/support/fakes.ts` return `any` on purpose.
- **Tests run on Vitest with `WxtVitest()`** (`vitest.config.ts`): it applies `wxt.config.ts`
  and replaces the extension API (`wxt/browser`, the `browser`/`chrome` globals) with WXT's
  in-memory `fakeBrowser`, reset per test where a test needs it (`fakeBrowser.reset()`). Tests run
  in Node and build their own jsdom documents. Type-only imports must be `import type` /
  `{ type X }`; relative imports name the file with its `.ts` extension (house style).
- **TypeScript is 6.0, not 7,** because `typescript-eslint` (8.x) needs the JS compiler API that
  TypeScript 7 no longer ships. Move to 7 once `typescript-eslint` supports it.
- Types live in the code; JSDoc keeps the descriptions only (no `{type}` in `@param`/`@returns`).
  Keep a JSDoc block comment on every exported function; say *why*, not what the name says.
- **Plain data where there is only data.** `TabState`, `AuctionKey`, `SettingsScope` and
  `AuctionSite` are `type`s; their helpers live in a same-named `const` (`TabState.of/from/equals/
  onAuction/forUrl`, `AuctionKey.from/equals`) or as functions (`findSite`, `identify`,
  `scopeMatches`), and the object itself is the message/storage format — no `toJSON()` round trip.
  Classes are kept where they guard an invariant: `Settings` (ranges), `SettingsBook` (lookup),
  `ExchangeRates` (rate direction), `Currency`. Their plain shapes are exported next to them
  (`SettingsJSON`, `ExchangeRatesJSON`, `SettingsEntryJSON`). A `PriceCalculator` is a function.
- Controllers declare their constructor dependencies as a local `Deps` type (the browser APIs as
  `Pick<WxtBrowser, …>`) and keep them in one `#deps` field, defaults filled in.

## Architecture invariants

- **`src/core/` never touches an extension API.** It works against a plain `Document` and plain
  strings, which is the only reason it can be unit tested with jsdom. Anything needing
  `chrome.*`/`browser.*` goes through `src/browser/` (the `ext` alias in `ext.ts`, messaging in
  `MessageBus.ts`) and is imported from `content/`, `background/` or `panel/`. Classes in
  `src/browser/` take `ext` as a constructor argument, so they are testable with a fake one —
  except `SettingsStore`, which is built on WXT's `wxt/utils/storage` and so uses the global
  extension API; its test runs against the `fakeBrowser` that `WxtVitest()` installs. Controllers
  still get the store injected and use `fakeStore()`.
- **Browser differences are confined to two places:** the `manifest` function in
  `wxt.config.ts` (only `browser_specific_settings` for Firefox; WXT itself emits `side_panel`
  vs. `sidebar_action` and the background key per browser) and `src/browser/side-panel.ts`
  (Chrome `sidePanel` vs. Firefox `sidebarAction`). Do not add an
  `import.meta.env.BROWSER === "chrome"` branch anywhere else; extend `src/browser/` instead.
- **`src/core/sites/sites.config.ts` is the single source of truth for the targets.** `SITES` is
  a list of `AuctionSite`s made with `defineSite()` (`origin`, `paths`, `priceSelectors`, `ids`
  for the house and auction ID in the URL: `{ query: "a" }` or `{ path: "/:id/auction" }`); the
  matching lives in `src/core/sites/sites.ts`, plugin-wide constants in `src/core/config.ts`.
  WXT takes the version from `package.json`; the content script's `matches`
  (`src/entrypoints/content.ts`) and the `host_permissions` (`wxt.config.ts`) both come from
  `matchPatterns(SITES)`, read at build time. Changing what the extension targets
  should mean editing only `sites.config.ts`.
- **Auction sites are always "sites"**, never "platforms"; the browsers are "browsers" (WXT's
  `-b chrome|firefox`).
- **`import.meta.env.BROWSER` is replaced at build time,** not a runtime variable, and only
  exists in code bundled by WXT. `src/browser/ext.ts` re-exports `browser` from `wxt/browser`,
  which tests cannot load — that is another reason core code stays free of `src/browser/`, and
  why tests inject a fake `ext` instead.
- **Entry points only wire things up.** They live in `src/entrypoints/` (WXT's `srcDir` is
  `src`): `content.ts` (`defineContentScript`) and `background.ts` (`defineBackground`) create a
  `ContentController` / `BackgroundController`, `sidepanel/main.tsx` (+ `index.html`) renders the
  React `Panel`, all with the real `window`/`ext`, `MessageBus` and `SettingsStore`; all
  behaviour lives in the controllers and the panel components, which get their dependencies
  through the constructor / props and are tested with jsdom and the fakes in
  `test/support/fakes.ts`. Controllers and components never import `src/browser/ext.ts` (it
  imports `wxt/browser`). Nothing may run at an entry point's top
  level besides imports: WXT imports `content.ts` and `background.ts` in Node at build time to
  read their options, so all wiring sits inside `main()` / the `defineBackground` callback.
  `content.ts` wires `ctx.onInvalidated(() => controller.stop())` and passes `() => ctx.isValid`
  as the controller's `isValid`; the controller never gets `ctx`. Anything `ContentController#start()`
  registers (listeners, observer, bus handler, storage subscription) must be undone in `stop()`,
  which also removes the annotations — the old copy keeps running in open tabs after a reload.
- **The side panel is React** (`@wxt-dev/module-react`, `src/panel/*.tsx`): `Panel` holds the
  state (active tab, shown settings, picked currency) and the listeners - registered in an
  effect and removed in its clean-up, which `StrictMode` exercises in dev builds -
  `SettingsForm`, `AuctionHeader` and `StatusCard` render, `useRates` loads the rates. The form
  and the IDs are only shown while `TabState.onAuction()` (active with a house or auction ID).
  The markup lives in the components (Bootstrap classes; `index.html` is just the root); keep
  labels and roles meaningful, the test (`test/panel.test.tsx`, Testing Library in a jsdom
  environment) finds elements by them. React stays out of the content script: the page is
  written to only by `AnnotationView`. ESLint runs `eslint-plugin-react-hooks` on `src/panel/`.
- **WXT config (`wxt.config.ts`):** `imports: false` — no auto-imports, every module imports
  `defineBackground` etc. explicitly (`wxt/utils/define-background`), so every module says where
  its names come from; `manifestVersion: 3` for both browsers (WXT defaults Firefox to MV2). A new entry
  point is a new file in `src/entrypoints/` following WXT's naming; files that go into the build
  as they are belong in `public/` (empty at the moment). The icons are generated at build time
  by `@wxt-dev/auto-icons` from `src/assets/icon.png` into `icons/<size>.png` (greyscale in dev
  builds); `action.default_icon`, the sidebar's `manifest.default_icon` meta tag and the panel's
  `<img>` point at those generated paths. Content script and background are bundled as IIFE
  (WXT's default — they cannot be ES modules), the side panel page as ES module. Bootstrap's CSS
  and `panel.css` are imported from `sidepanel/main.tsx`; the Firefox sidebar's title and icon come
  from `<meta name="manifest.…">` tags in `index.html`.
- **`content.css` inlines its PNGs:** the content entry point imports it, WXT lists it under
  `content_scripts[].css`, and `assetsInlineLimit` in `wxt.config.ts` forces the PNGs it
  references inline as `data:` URLs — content-script CSS cannot use relative URLs into the
  extension, and this avoids `web_accessible_resources` and a per-browser
  `chrome-extension://`/`moz-extension://` URL. It references a committed source file
  (`../assets/minerva-64.png`, a 64 px copy of the icon), not `/icons/…`: Vite would leave that
  as a page URL, and the generated icons only exist after bundling.

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
  such a selector stops matching it from the second run on (`test/sites.test.ts` rejects them).
  Count from the start instead (`:nth-child(2)`). Annotations whose element is no longer
  annotated are removed on every run (`AnnotationView#removeAllBut()`), so a lost match shows
  as a missing annotation, never as a stale amount.
- **`origin` is protocol + host only, `paths` are path globs only.** A URL is on a site
  (`findSite()`) when its origin equals the site's `origin` and its *pathname* (query/hash
  ignored) matches one of the paths via our tiny glob matcher (`globSource()` in
  `src/core/regexp.ts`, `*` only, exact otherwise). `matchPatternFor()` derives the
  manifest match pattern `<protocol>//<host>/*` and drops any port, since match patterns cannot
  carry one; the origin check still enforces it.
- **The tests run against their own site lists** (the controllers take an optional
  `sites` argument defaulting to `SITES`), so the real config can change freely. The real `SITES`
  only gets a shape check in `test/sites.test.ts` (`origin` without path, paths start with `/`,
  selectors parse as CSS).
- **Price formatting mirrors the input notation** (currency position, decimal/grouping separators,
  surrounding text). The one ambiguous rule: a single separator followed by exactly three digits
  is read as *grouping* (`1.359` = 1359), anything else as a decimal separator (`1.35` = 1.35).
  The currency token closest to the number (`CurrencyDetector`) is the input currency and is
  the only part swapped on output. Change `src/core/price.ts` or `src/core/currency/` only with a
  matching case added to `test/price.test.ts` or `test/currency.test.ts`.
- **`Currency.ALL` (`src/core/currency/Currency.ts`) is the one list of supported currencies:**
  code, output symbol and the tokens recognised in page text. Detection, the panel's currency
  options and the exchange rates request are all derived from it.
- `dist/`, `.wxt/`, `.output/` and `.poc/` are gitignored. `.wxt/` is generated by `wxt prepare`
  (also run on `npm install`). `.poc/` holds unrelated reference extensions
  (Mozilla samples etc.) — not part of the build, safe to ignore.

## Settings and the effective price

- **All storage goes through `SettingsStore` (`src/browser/SettingsStore.ts`).** The layout is
  `{ auctionSettings: SettingsBook#toJSON(), exchangeRates: { [base]: ExchangeRates#toJSON() },
  storageVersion }`; `load()` reads them in one `storage.local.get` (`storage.getItems`) and
  returns the `SettingsBook` and the rates per currency. `save(key, settings, rates)` writes all
  three in **one** `storage.local.set` (`storage.setItems`), so there is one change event and
  nobody sees new settings without their rates. `saveRates()` (background) writes the rates only,
  so a refresh never undoes a concurrent save. `onChange()` watches the two data items
  (`item.watch()`) and is therefore called once per changed key — twice after a save, each time
  seeing both; the content script's re-sync is idempotent, so that is harmless. The items are
  defined in the constructor, never at module level: `defineItem()` reads storage right away, and
  entry points are imported in Node at build time.
- **Changing the stored layout** means raising `SettingsStore.VERSION` and adding the conversion
  from the previous version to `SettingsStore.MIGRATIONS` (none yet; data without
  `storageVersion` is version 1). `load()` converts older data in memory in every context,
  `save()` writes the current version, and the background's `migrate()` (on `runtime.onInstalled`)
  rewrites the stored data once and records the version even on a fresh install. This is our own
  runner over both keys, not WXT's per-item `version`/`migrations`: WXT's `storage.setItems()`
  writes no version metadata, so data written that way would later be taken for version 1.
- **Settings are saved per auction.** `SettingsBook` (`src/core/settings/`) holds one entry per
  `AuctionKey` (site origin + house + auction ID, as `TabState` carries them; `null` = unknown),
  newest last. `resolve(key)` walks `SETTINGS_SCOPES` (`SettingsScope.ts`: auction > house > site,
  each a list of key fields that must be equal) and returns the newest entry of the first scope
  with one, or `null` - then `Settings.DEFAULT` applies. A scope is skipped when one of its fields
  is unknown on the page, so unknown IDs never match each other. The lookup order lives only in
  `SETTINGS_SCOPES`; saving always stores the full key. The content script resolves on every
  `sync()` (so URL changes switch settings), the panel when the active tab's `AuctionKey` changes.
- The panel shows the resolved settings and saves the full `Settings` under the active tab's key
  when Save is clicked; an emptied input keeps the value shown. The input ranges live in
  `Settings.RANGES` only; the panel sets its inputs' `min`/`max` from them. There is no message
  for settings — storage is the channel: after saving, the panel sends `SYNC_REQUEST` to the
  active tab, and the content script **re-reads the settings on every `SYNC_REQUEST`** before
  syncing. `SettingsStore.onChange()` additionally updates the other open tabs.
- **The calculation is per site:** every `AuctionSite` has a `calculator`, a `PriceCalculator`
  function `(amount, currency, settings, rates)` (`src/core/pricing/`) that `PriceAnnotator`
  uses for that site's prices. The default is `effectivePrice`:
  `rates.convert(amount * (1 + auctionPremium / 100) + shipment, currency)`, in
  `settings.currency`. The shipment is entered in the auction's currency (the price's, not
  `settings.currency`), so it is converted together with the price; the panel shows the
  `TabState#currencies` next to it. A site with different fees gets a function of its own,
  passed as `calculator` in `sites.config.ts`. `currency` is the input currency read from the price text,
  `rates` an `ExchangeRates` with `settings.currency` as base. A missing currency or rate returns
  `undefined`, which `convertPrice()` turns into `null` and the annotator into `n/a` — no
  guessing, no fallback rate.
- **`ExchangeRates` (`src/core/rates/ExchangeRates.ts`) is the only place that knows the rate
  direction:** `rates[code]` is "1 base = x code", `factorFrom(code)`/`convert()` go the other way
  (code → base). It drops invalid entries on construction and is immutable.
- **The background owns the exchange rates** (`RatesService` in `src/background/`, the only user
  of `RatesClient`). It answers the panel's `GET_RATES` (reusing fetched rates for an hour) and
  keeps the saved rates fresh: on install/update, on browser start and via a daily `alarms`
  alarm (`refresh-exchange-rates`; re-created on start because Firefox drops alarms on restart).
  A refresh covers every currency of the saved settings plus `Settings.DEFAULT.currency` (used
  where nothing saved applies), each saved on its own.
- The panel displays the rates it gets from the background and saves them together with the
  settings on Save (one write, see above). `useRates` (`src/panel/`) lets only the latest
  request count, so fast currency switches cannot show or store stale rates; Save waits for the
  latest request (`ratesFor()`). Rates are stored
  per base currency; without stored rates for a currency only the output currency itself (1:1)
  is known.
- Rates come from Frankfurter (`EXCHANGE_RATES_URL` in `config.ts`, plain `fetch` with an
  injectable fetch function for tests). It sends `Access-Control-Allow-Origin: *`, so no
  `host_permissions` are needed.

## Message flow

Three types only, in `src/core/messages.ts`:

- background → content: `SYNC_REQUEST` on `tabs.onUpdated` (fires for SPA `pushState` too, which
  is how in-page navigation is caught); content also self-syncs on load, `popstate`, `hashchange`
  and DOM mutations (coalesced to one run per animation frame).
- panel → content (active tab): `SYNC_REQUEST`, answered with the tab's state — how the panel
  learns what the active tab does (`tabs.query({ active: true, currentWindow: true })`); without
  a content script it judges the tab by its URL (`TabState.forUrl()`).
- content → background/panel: `STATE_CHANGED`, only when the `TabState` actually changed
  (`TabState.equals()`). Background turns it into the toolbar badge, the panel re-asks the tab.
- panel → background: `GET_RATES` (`base`), answered with `{ rates }` (`ExchangeRates#toJSON()`)
  or `{ error }`.

Listen with `MessageBus.on(type, handler)`, never `runtime.onMessage` directly: the handler
returns its answer (or a promise of it, `undefined` for none) and the bus returns `true` to keep
the channel open when needed — required for async answers and easy to drop by hand. Send with
`bus.send()` / `bus.sendToTab()`, which ignore a missing receiver (and then resolve `undefined`).

**The protocol is typed** (`Protocol` in `messages.ts`): per type the payload besides `type` and
the answer (`void` for none). `on()`, `send()` and `sendToTab()` are generic over it, so a wrong
payload, a wrong answer or an unknown type does not compile. A new message type means a `MSG`
entry plus a `Protocol` entry. The types are a promise between our own contexts, not validation:
receivers still check what arrives (`TabState.from()`, `Currency.of()`). The wire format is the
message itself, `{ type, ...payload }`.

The state of a tab is a `TabState` (`src/core/state/TabState.ts`: `active`, `annotated`,
`unparsable`, `currencies` of the prices found, and the `AuctionKey` fields `site` origin,
`house`/`auction` IDs). It is plain data, so it is sent as it is (`{ ...state, url }`); receivers
validate what arrives with `TabState.from()`.

## Conventions

- Conventional-commit subjects (`feat:`, `fix:`). Commits authored by AI are marked in the
  subject, e.g. `feat: [by AI] Convert price live on page` — keep that marker.
- Verifying a change usually means `npm test` plus, for anything touching the content or
  background script, a real build loaded into a browser (`npm run dev:firefox` is the quickest).
