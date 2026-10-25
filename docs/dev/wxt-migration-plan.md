# Migration Plan — WXT

*Started 2026-10-03 (at commit `a1fd1d5`, follows up step 15 of [`architecture-review.md`](architecture-review.md#phase-4--strategic-decide-separately)) · Consolidated 2026-10-25 after phase 1.*

| Phase | Content | State |
| --- | --- | --- |
| **1 — Build swap** | WXT replaces esbuild, the hand-written manifests, `__TARGET__` and the zip script; behaviour unchanged | **done** on branch `feature/WXT-migration`, except the browser check (R0) |
| **2 — Follow-ups** | Steps R0–R7 below, each optional except R0, each its own commit | open |

---

## 0. Resuming in a new session

1. Read `CLAUDE.md` (invariants, conventions) and this file. Section 1 is the current state, section 2 the open steps in their recommended order, each with its trigger, tasks, files and checks.
2. `git log --oneline` / `git status` to see which steps have landed since; tick them off in the table of section 2 when you finish one.
3. Rules for every step: one commit per step, subject with the `[by AI]` marker (`build: [by AI] …`, `refactor: [by AI] …`); `npm test` green; `npm run build && npm run lint:firefox` clean; `CLAUDE.md` and `docs/architecture.md` updated when a component, message, storage key, listener or build rule changes; anything touching content or background additionally checked in a browser (section 3).
4. Upgrading WXT is not a step of its own: `wxt` is `^0.21.4` (with 0.x, the caret pins the minor). After any upgrade, diff `dist/*/manifest.json` against the previous build — only file paths and key order may change.

## 1. Current state (after phase 1)

**Versions:** WXT 0.21.4 (Vite 8), TypeScript 7 (`tsc` over JSDoc, `checkJs`, non-strict), Node 24, `node:test` + jsdom.

**Layout and config** — `wxt.config.js`:

- `srcDir: "src"`, `publicDir: "public"`, `outDir: "dist"`, `outDirTemplate: "{{browser}}{{modeSuffix}}"` → `dist/chrome`, `dist/firefox`; dev mode writes `dist/<browser>-dev`.
- `manifestVersion: 3` for both browsers (WXT defaults Firefox to MV2); `imports: false` (no auto-imports, so `node --test` can load every module).
- `manifest({ browser })`: name, description, icons, `permissions` (`tabs`, `storage`, `alarms`), `host_permissions` from `SITES.matchPatterns()`, `action`; for Firefox only `browser_specific_settings` (Gecko ID `element-marker@example.com`, `strict_min_version: "142.0"`, `data_collection_permissions`). WXT adds `side_panel` + `sidePanel` (Chrome) / `sidebar_action` (Firefox) and service worker (Chrome) / `background.scripts` (Firefox).
- `vite.build.assetsInlineLimit` forces PNGs inline, `zip` keeps the names `minerva-<version>-<browser>.zip` + `minerva-<version>-sources.zip` (AMO).

Entry points (wiring only, nothing at top level — WXT imports them in Node at build time):

```text
src/entrypoints/background.js         defineBackground(() => …BackgroundController…)
src/entrypoints/content.js            defineContentScript({ matches: SITES.matchPatterns(), runAt, main() })
src/entrypoints/sidepanel/index.html  the panel markup (+ <meta name="manifest.…"> for the Firefox sidebar)
src/entrypoints/sidepanel/main.js     imports Bootstrap + panel.css, wires the PanelController
public/icons/icon-*.png               copied as is; icons/base.png is their source (npm run icons, sharp)
```

`src/browser/ext.js` re-exports `browser` from `wxt/browser`; `src/browser/side-panel.js` branches on `import.meta.env.BROWSER`. `src/core/`, the controllers, views, `MessageBus`, `SettingsStore` and the tests are unchanged apart from paths.

**Things learned in phase 1** (keep in mind for phase 2):

- **Firefox sidebar title/icon** come from `<meta name="manifest.title">` / `<meta name="manifest.default_icon">` in `sidepanel/index.html`; without them the title would be the page `<title>` ("Minerva").
- **`content.css` must reference `../../public/icons/icon-64.png`,** not `/icons/…`: Vite leaves public URLs alone, and in a content script they would resolve against the auction page. The icon is 4.7 KB, above Vite's 4 KB inline default, hence the `assetsInlineLimit` function.
- **`ext` is now typed after Chrome's API** (`WxtBrowser`), so Firefox-only APIs need a cast — currently once, `sidebarAction` in `side-panel.js`.
- **Typecheck needs generated types:** `jsconfig.json` includes `.wxt/wxt.d.ts`; `npm run typecheck` runs `wxt prepare` first (also run on `postinstall`).
- **Zips land in `dist/`** (WXT always zips into `outDir`); CI uploads `dist/*.zip`. The sources zip leaves out dotfolders (`.poc/`, `.private`, `.wxt/`) by default and `icons/base.png` by config.
- **`npm run watch` is gone;** `npm run dev` / `dev:firefox` start a throwaway profile with auto-reload.
- **`npm audit`** reports 4 high-severity issues in `node-forge`, pulled in by `web-ext` (ours and WXT's). It was there before WXT; recheck when `web-ext` updates.
- **Verified without a browser:** manifests diffed against the old build (only paths and permission order differ); the built content script annotated all 100 lots of a saved biddr page in jsdom with a fake `chrome`; both built background scripts register the same listeners as before (Chrome: `setPanelBehavior`, Firefox: `action.onClicked`).

**Mapping old → new** (for reading old commits and docs):

| Before | Now |
| --- | --- |
| `scripts/build.mjs` (esbuild, IIFE, `define`, static copy, watch) | `wxt build -b chrome\|firefox`, `wxt -b …` for dev |
| `platforms/<target>/manifest.json` with `$VERSION` / `$CONTENT_MATCHES` | `manifest` in `wxt.config.js` + entry point options; version from `package.json` |
| `__TARGET__`, `src/types/globals.d.ts` | `import.meta.env.BROWSER`, typed by `.wxt/` |
| `globalThis.browser ?? globalThis.chrome` | `browser` from `wxt/browser` |
| `src/{background,content}/*.js`, `src/panel/panel.{html,js}` entry points | `src/entrypoints/…` |
| `icons/icon-*.png`, `dist/<target>/vendor/bootstrap.min.css` | `public/icons/`, Bootstrap bundled into the side panel CSS |
| `scripts/package.mjs` → `build/*.zip` | `wxt zip` → `dist/*.zip` (+ sources zip) |

## 2. Remaining steps

Recommended order. R0 is required before merging phase 1; R1 is a cheap clean-up, R2 an optional one; R3–R5 are decisions with a trigger; R6–R7 are only worth it under the stated condition.

| Step | What | Kind | Trigger / condition | Effort | State |
| --- | --- | --- | --- | --- | --- |
| R0 | Browser verification of phase 1 | required | before merging `feature/WXT-migration` | 1–2 h | open |
| R1 | Content script teardown via WXT's `ctx` | clean-up | next, dev quality | 1–2 h | open |
| R2 | `@wxt-dev/auto-icons` instead of `make-icons.mjs` | clean-up, low value | only if the committed PNGs get in the way | 0.5 h | optional |
| R3 | TypeScript, file by file | decision | when types start to pay (more casts, new storage schema) | 0.5–1 day | open |
| R4 | `wxt/storage` in `SettingsStore` | decision | together with the next storage schema change (buyer settings, see README "Further factors") | 0.5 day | open |
| R5 | Release automation (`wxt submit`, CI on tag), final Gecko ID | decision | before the first store listing | 0.5 day | open |
| R6 | Typed messaging (`@webext-core/messaging`) | conditional | only with clearly more than the current 4 message types | 0.5 day | open |
| R7 | Vitest + WXT `fakeBrowser` | conditional | only if `test/support/fakes.mjs` becomes a burden | 1 day | not recommended now |

### R0 — Browser verification of phase 1 (required)

With the **built** extension (`npm run build`, load `dist/chrome` unpacked and `dist/firefox/manifest.json` temporarily), in both Chrome and Firefox:

1. Toolbar icon opens the side panel (Chrome) / toggles the sidebar (Firefox); the Firefox sidebar is titled "Minerva - Online Auction Assistant".
2. On a configured site the badge shows `ON`, prices get a `minerva-effective-price` sibling with the Minerva avatar (the inlined icon), `n/a` for unparsable text, no DOM churn once settled. On biddr check a running and a finished auction (e.g. `https://www.biddr.com/namnumismatic/auction?a=7619`).
3. SPA navigation (`pushState`) out of and back into a site path removes and restores the annotations.
4. Saving settings in the panel updates the open tab and other open tabs; the exchange rates table loads; the panel's Bootstrap styling is intact.
5. **Update in place:** install a build of `main` from before the migration, save settings, then load the WXT build over it (Firefox: same Gecko ID; Chrome: same unpacked folder) — settings survive, the `refresh-exchange-rates` alarm exists again.
6. `npm run dev` and `npm run dev:firefox` start, and a change to a controller reloads the extension.
7. `npm run package` produces three zips; the Firefox zip passes `npm run lint:firefox`.

The fixture described under "Verified in real browsers" in `docs/development.md` covers 2–3. Record the result there (date, browser versions). Then merge.

### R1 — Content script teardown via `ctx`

**Why:** when the extension reloads (every change in dev mode, and on updates), the old content script keeps running in open tabs with a dead runtime — its `MutationObserver` and listeners keep firing and the old annotations stay. WXT passes a `ContentScriptContext` to `main(ctx)`; `ctx.onInvalidated(cb)` fires exactly then.

**Today nothing can be torn down:** `ContentController` has only `start()`; `MessageBus.on()` and `SettingsStore.onChange()` return nothing; the `MutationObserver` (`ContentController.js`, `#observe…`) and the `popstate`/`hashchange` listeners are never removed.

Tasks:

- `MessageBus.on()` stays chainable; add `MessageBus#off(type)` (or `dispose()`, which removes the `runtime.onMessage` listener). `SettingsStore.onChange()` returns an unsubscribe function.
- `ContentController#stop()`: disconnect the observer, cancel a pending animation frame, remove the window listeners, unsubscribe bus and store, `annotator.clear()` (removes our siblings), and make a late `sync()` a no-op.
- `src/entrypoints/content.js`: `main(ctx) { const controller = new ContentController(…); controller.start(); ctx.onInvalidated(() => controller.stop()); }`. The controller does **not** get `ctx` itself, so it stays testable without WXT.
- Tests: `content-controller.test.mjs` — after `stop()` a DOM mutation, `popstate` and a `SYNC_REQUEST` cause no write and no message, and the annotations are gone; fakes in `test/support/fakes.mjs` get `off` / unsubscribe.
- Docs: `docs/architecture.md` (content script lifecycle diagram), `CLAUDE.md` (entry points paragraph).
- Do **not** use WXT's content script UI helpers (`createShadowRootUi`, `createIntegratedUi`): `AnnotationView` must keep writing plain siblings.

Check: in `npm run dev:firefox`, edit a controller, let it reload — the tab shows exactly one set of annotations, and the console of the page shows no "Extension context invalidated" errors.

### R2 — `@wxt-dev/auto-icons` (optional, low value)

What it does (checked in 1.1.2): resizes `baseIconPath` (relative to `srcDir`, default `assets/icon.png`) with **`sharp`** at build time into `icons/<size>.png`, sets `manifest.icons` to those, and adds a dev-mode overlay to tell the dev build apart. It does **not** set `action.default_icon` or the sidebar icon.

So it would not remove `sharp`, and it renames the files (`icons/16.png` instead of `icons/icon-16.png`). The gain is not committing the five PNGs, plus the dev overlay. If done:

- `npm i -D @wxt-dev/auto-icons`, `modules: ["@wxt-dev/auto-icons"]` and `autoIcons: { baseIconPath: "../icons/base.png", sizes: [16, 32, 48, 64, 128] }` in `wxt.config.js`.
- Point `action.default_icon` and the `manifest.default_icon` meta tag in `sidepanel/index.html` at `icons/<size>.png`.
- `content.css` (inlined) and the panel's `<img>` need a concrete PNG that exists at build time: keep one committed copy (e.g. `src/assets/minerva-64.png`, `minerva-128.png`); `base.png` (400 KB) is too big to inline.
- Remove `scripts/make-icons.mjs`, the `icons` script and `public/icons/`; keep `sharp` (auto-icons needs it). Update `CLAUDE.md` and `docs/architecture.md`.
- Check: manifest diff (icon paths only), avatar on the page and image in the panel still shown, AMO linter clean.

### R3 — TypeScript, file by file (decision)

**For:** WXT generates the types (`.wxt/`), the browser API is already typed (`WxtBrowser`), and the JSDoc types are already checked — conversion is mostly syntax. **Against:** today's JSDoc + `checkJs` already catches most errors; the tests rely on `node --test` loading the sources directly.

Constraints and approach:

- **Tests keep running on Node directly:** Node 24 strips types natively, but only *erasable* syntax — no `enum`, no parameter properties, no `namespace`; set `erasableSyntaxOnly` and `verbatimModuleSyntax`, and import with the `.ts` extension (`allowImportingTsExtensions`). The test glob becomes `test/*.test.{mjs,ts}`.
- Replace `jsconfig.json` with a `tsconfig.json` that `extends: "./.wxt/tsconfig.json"` (strict, `noUncheckedIndexedAccess`), but start with `strict: false` + `allowJs` + `checkJs`, so `.js` and `.ts` coexist; tighten per folder later. WXT's peer range is `typescript >= 5.4`; TypeScript 7 works for `tsc` today (phase 1).
- Order: `src/browser/` first (removes the `sidebarAction` cast with a proper Firefox type), then `src/core/` leaf modules (`currency/`, `rates/`, `price.js`), then controllers and views, entry points and `wxt.config.js` last. One commit per folder.
- Keep the JSDoc block comments on exported functions (CLAUDE.md), drop only the `@type`/`@param` type annotations that TypeScript now carries.
- ESLint: add `typescript-eslint` (flat config) for `.ts` files; Prettier needs nothing.
- Update `CLAUDE.md` (types section, commands) and `docs/development.md`.

### R4 — `wxt/storage` in `SettingsStore` (decision, with a schema change)

Do this only together with the next storage change — the buyer-level settings from README "Further factors of the effective price" (import VAT, FX markup, payment surcharge: global, not per auction) are the natural one, so the migration machinery has a reason to exist.

- `wxt/utils/storage` (= `@wxt-dev/storage`): `storage.defineItem("local:auctionSettings", { fallback, version, migrations })`, the same for `local:exchangeRates`, and a new `local:buyerSettings`. Keys stay the same as today — existing installs keep their data.
- **Keep the one-write invariant** (CLAUDE.md "Settings and the effective price"): settings and their rates must arrive in **one** change event — use `storage.setItems([...])` (one `storage.local.set`) and verify in a test that listeners see one change. If that cannot be guaranteed, keep the hand-written `save()`.
- The 0.1.0 conversions in `SettingsStore#migrate(sites)` (global `settings` key, one key per setting) need `sites` and write *new* keys from old ones — that is not what item `migrations` (one item's value across versions) do. Keep `migrate()` for those, use `version`/`migrations` only for changes from now on.
- `SettingsStore` keeps its public API (`load`, `save`, `saveRates`, `onChange`, `migrate`), so controllers and their tests do not change; `test/settings-store.test.mjs` then needs WXT's `fakeBrowser` or a fake that `@wxt-dev/storage` accepts — check that first (it binds to `browser` from `@wxt-dev/browser`, not an injected `ext`). If it cannot be injected, this step drags in R7; weigh that before starting.
- Docs: storage section of `docs/architecture.md`, `CLAUDE.md`.

### R5 — Release automation (decision)

- **Gecko ID first:** `element-marker@example.com` is a placeholder from the very first prototype. Before the first AMO listing, choose the final ID (e.g. `minerva@<domain>`) — it cannot change afterwards without breaking updates. Self-hosted/temporary installs are the only ones affected by changing it now.
- `wxt submit` is an alias for `publish-browser-extension` (install it as dev dependency): `wxt submit init` writes the store credentials into `.env.submit` (gitignore it); CI gets them as secrets.
- GitHub Actions: a `release.yml` on tags `v*` — `npm ci`, `npm test`, `npm run package`, `wxt submit --chrome-zip … --firefox-zip … --firefox-sources-zip …`, attach the zips to a GitHub release. Keep `ci.yml` as it is.
- Version: `npm version <patch|minor>` bumps `package.json` (WXT reads it) and tags.
- Docs: a "Release" section in `docs/development.md`.

### R6 — Typed messaging (conditional)

Only once there are clearly more message types than the current four (`SYNC_REQUEST`, `STATE_CHANGED`, `GET_ACTIVE_STATE`, `GET_RATES`). `@webext-core/messaging` (4.x) gives typed `sendMessage`/`onMessage` from one protocol map. `MessageBus` already encodes the `return true` rule and ignores missing receivers — any replacement must keep both, keep `TabState.from()` at the receiving end (structured clone) and stay injectable (`ext`) for the controller tests. Most of the type benefit is also reachable with R3 alone (a typed `MSG` map in `messages.js`).

### R7 — Vitest + WXT `fakeBrowser` (conditional, not recommended now)

`wxt/testing` offers `WxtVitest()` (Vite plugin) and `fakeBrowser` (in-memory `browser`). Not needed while controllers get `ext` injected and `test/support/fakes.mjs` stays small; switching means moving 149 tests from `node:test` to Vitest. Reconsider only if R4 requires `fakeBrowser`, or the fakes start re-implementing browser behaviour.

## 3. Verification checklist (every step)

- `npm test` (lint, typecheck incl. `wxt prepare`, unit + controller tests).
- `npm run build`, `npm run lint:firefox`; for build or config changes also `npm run package` and a manifest diff against the previous `dist/*/manifest.json`.
- For anything touching content script, background or side panel: points 1–4 of R0 in at least Firefox (`npm run dev:firefox` is the quickest), both browsers before a merge.

## 4. Decisions that stay

- `srcDir: "src"` — layering (`core / browser / controllers / entrypoints`) stays visible, all source in one tree.
- `imports: false` — explicit imports only; modules stay loadable by `node --test`.
- `manifestVersion: 3` for both browsers.
- Content script without shadow root or WXT UI helpers; `AnnotationView` remains the only writer to the page.
- Browser differences only in the `manifest` function of `wxt.config.js` and in `src/browser/side-panel.js`.
- No UI framework for the panel.
