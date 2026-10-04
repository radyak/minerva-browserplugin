# Migration Plan — WXT

*Date: 2026-10-03 · Scope: build, manifests, entry points and tooling at commit `a1fd1d5` · Follows up step 15 of [`architecture-review.md`](architecture-review.md#phase-4--strategic-decide-separately).*

---

## 1. Goal and non-goals

**Goal:** replace the hand-written build infrastructure (`scripts/build.mjs`, `scripts/package.mjs`, `platforms/<target>/manifest.json`, the `__TARGET__` define) with [WXT](https://wxt.dev), without changing what the extension does in either browser.

**Non-goals for this migration** (each is a separate decision afterwards, see section 7):

- No TypeScript conversion. WXT works with plain JS; the JSDoc + `checkJs` setup stays.
- No switch to `@webext-core/messaging` or `wxt/storage`. `MessageBus` and `SettingsStore` stay as they are.
- No change to `src/core/`, the controllers, the views or the tests beyond import paths.
- No new UI framework for the panel.

Keeping the scope this narrow means the migration is a pure build swap: if the built extension behaves the same in both browsers and `npm test` is green, it is done.

## 2. Why it is cheap now

The refactoring of phases 1–3 already did most of the work WXT needs:

- **Entry points only wire things up.** `background.js`, `content.js` and `panel.js` are 10–20 lines each; all behaviour lives in controllers that take their dependencies through the constructor. Moving the entry points into `entrypoints/` touches nothing else.
- **There is exactly one browser branch** (`src/browser/side-panel.js`), and one build-time constant (`__TARGET__`, read in `src/browser/ext.js`).
- **`SITES` is plain JS without extension APIs**, so it can be imported at build time by both `wxt.config.js` (host permissions) and `defineContentScript()` (matches).
- **Tests never import `src/browser/ext.js`**, so they do not care which bundler resolves `__TARGET__` or its replacement.

## 3. What maps to what

| Today                                                                  | With WXT                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `scripts/build.mjs` (esbuild, IIFE, `define`, static copy, watch)      | `wxt build -b chrome` / `wxt build -b firefox` (Vite); `wxt` / `wxt -b firefox` for dev with auto-reload     |
| `platforms/chrome/manifest.json`, `platforms/firefox/manifest.json`    | `manifest` in `wxt.config.js` (a function of `{ browser }` for the few differences) + entrypoint options     |
| `$VERSION` placeholder                                                 | WXT reads `version` from `package.json`                                                                      |
| `$CONTENT_MATCHES` placeholder                                         | `defineContentScript({ matches: SITES.matchPatterns() })` and `host_permissions` in `wxt.config.js`         |
| `side_panel` (Chrome) / `sidebar_action` (Firefox) manifest keys       | One `entrypoints/sidepanel/index.html`; WXT emits the right key per browser                                  |
| `background.service_worker` (Chrome) / `background.scripts` (Firefox)  | `entrypoints/background.js` with `defineBackground()`; WXT emits the right key per browser                   |
| `__TARGET__` + `src/types/globals.d.ts`                                | `import.meta.env.BROWSER` (`"chrome"` / `"firefox"`), typed by WXT's generated `.wxt/` types                 |
| `globalThis.browser ?? globalThis.chrome` in `ext.js`                  | `import { browser } from "wxt/browser"` (same thing since WXT 0.20, no polyfill)                             |
| `copyStaticAssets()`: icons, `content.css`, `panel.css`, Bootstrap CSS | `public/icons/` (copied as is); CSS imported from the entrypoints and bundled by Vite                        |
| `scripts/package.mjs` (`zip -r`)                                       | `wxt zip -b chrome` / `wxt zip -b firefox` (Firefox additionally gets the sources zip AMO asks for)          |
| `npm run dev:firefox` (`web-ext run`)                                  | `wxt -b firefox` (WXT drives `web-ext` itself)                                                               |
| `npm run lint:firefox` (`web-ext lint`)                                | unchanged, pointed at the new output directory                                                               |

What stays exactly as it is: `src/core/**`, `src/browser/MessageBus.js`, `src/browser/SettingsStore.js`, all controllers and views, `test/**` (except the panel HTML path), `scripts/make-icons.mjs`, ESLint/Prettier/`tsc` as the checks in `npm test`.

## 4. Target layout

WXT's `srcDir` is set to `src`, so the existing tree stays where it is and only gains an `entrypoints/` folder:

```text
wxt.config.js                    # manifest, srcDir, outDir, manifestVersion: 3, imports: false
public/
  icons/icon-{16,32,48,64,128}.png
icons/base.png                   # source for `npm run icons`, writes into public/icons/
src/
  entrypoints/
    background.js                # defineBackground(() => { …wiring from background/background.js… })
    content.js                   # defineContentScript({ matches, runAt, main() { … } })
    sidepanel/
      index.html                 # was src/panel/panel.html
      main.js                    # was src/panel/panel.js
  background/                    # BackgroundController, RatesService — unchanged
  content/                       # ContentController, content.css — unchanged
  panel/                         # PanelController, SelectedRates, views, panel.css — unchanged
  browser/                       # ext.js (→ wxt/browser), side-panel.js (→ import.meta.env.BROWSER), MessageBus, SettingsStore
  core/                          # unchanged
```

Removed: `scripts/build.mjs`, `scripts/package.mjs`, `platforms/`, `src/types/globals.d.ts` (unless other globals get added), the old entry point files.

Decisions baked into this layout:

- **`srcDir: "src"`** instead of WXT's default root-level `entrypoints/`, to keep the `core / browser / controllers` layering visible and all source in one tree.
- **`imports: false`** — WXT's auto-imports are turned off. Every module keeps explicit imports, so files stay readable on their own and `node --test` can still load them without WXT's transform.
- **`manifestVersion: 3` for every browser** — WXT builds Firefox as MV2 by default; Minerva is MV3 in both.
- **`outDir: "dist"` with `outDirTemplate: "{{browser}}"`** so the output stays at `dist/chrome` and `dist/firefox`, and `docs/development.md`, `lint:firefox` and existing habits keep working. (Fallback if the template option does not behave: accept WXT's `.output/chrome-mv3` and update the docs.)

## 5. Steps

Each step is its own commit on a `feature/wxt` branch and ends with `npm test` green. Steps 3–6 can only be verified in a browser, so they end with a manual check in both browsers (see section 6).

### Step 0 — Spike (time-boxed, ~1–2 h, throwaway)

Before touching the real tree, confirm the few points the plan relies on but that depend on WXT's version (current 0.20.x):

1. `sidepanel` entrypoint produces `side_panel` + the `sidePanel` permission on Chrome and `sidebar_action` on Firefox, and how `default_title` / `default_icon` of the Firefox sidebar are set (HTML `<meta name="manifest.…">` tags vs. the manifest function).
2. `outDir` + `outDirTemplate` give `dist/chrome` / `dist/firefox`.
3. Importing `SITES` inside `defineContentScript()` works at build time (WXT evaluates entrypoint files in Node to read their options; `sites.config.js` only imports plain classes, so it should).
4. Firefox MV3 background is emitted as `background.scripts` (event page), not as a service worker.
5. `wxt prepare` and the generated `.wxt/tsconfig.json` get along with `typescript@7` and our `jsconfig.json` (`checkJs`, non-strict). If not, pin the TypeScript version WXT supports for the typecheck.

Outcome: either confirm the layout in section 4 or adjust it here before step 1.

### Step 1 — Add WXT next to the existing build

- `npm install -D wxt`; add `"postinstall": "wxt prepare"`.
- Add `wxt.config.js` with `srcDir`, `outDir`, `outDirTemplate`, `manifestVersion: 3`, `imports: false` and the shared manifest fields: `name`, `description`, `permissions` (`tabs`, `storage`, `alarms`), `host_permissions` from `SITES.matchPatterns()`, `action`, `icons`; for Firefox `browser_specific_settings` (keep the Gecko ID `element-marker@example.com` — changing it breaks updates — `strict_min_version: "142.0"` and `data_collection_permissions`).
- Add `.wxt/` and `.output/` to `.gitignore`, `.prettierignore` and the ESLint `ignores`.
- Old scripts still build; nothing uses WXT yet.

### Step 2 — Move the icons to `public/`

- `git mv icons/icon-*.png public/icons/`; keep `icons/base.png` where it is and point `scripts/make-icons.mjs` at `public/icons/`.
- Manifest `icons` and `action.default_icon` keep the same paths (`icons/icon-16.png` …), so nothing else changes.
- Optional, decide later: replace `make-icons.mjs` + `sharp` by the `@wxt-dev/auto-icons` module (generates the sizes from `base.png` at build time). Not part of this migration.

### Step 3 — Background entrypoint

- `src/entrypoints/background.js`: `export default defineBackground(() => { … })` with the body of `src/background/background.js` moved inside. Nothing may run at module top level: WXT imports the file in Node at build time.
- `src/browser/ext.js`: `export { browser as ext } from "wxt/browser";` (keeps the `ext` name, so no other file changes); drop `TARGET`.
- `src/browser/side-panel.js`: `if (import.meta.env.BROWSER === "chrome")` instead of `TARGET === "chrome"`. Vite strips the dead branch just as esbuild did.
- Delete `src/background/background.js` and `src/types/globals.d.ts`; remove `__TARGET__` from `eslint.config.js`.

### Step 4 — Content script entrypoint

- `src/entrypoints/content.js`:

  ```js
  export default defineContentScript({
    matches: SITES.matchPatterns(),
    runAt: "document_idle",
    main() {
      new ContentController({ window, bus: new MessageBus(ext), store: new SettingsStore(ext) }).start();
    },
  });
  ```

- `import "../content/content.css";` in the entrypoint, so WXT lists it under `content_scripts[].css` (default `cssInjectionMode: "manifest"` — same behaviour as today, no shadow root).
- Keep the bundle IIFE (WXT's default for content scripts). Do **not** use `createShadowRootUi` or `ctx`-based UI helpers — `AnnotationView` must keep writing plain siblings into the page.
- Optional but cheap: pass `ctx.onInvalidated` to the controller later so an extension reload during dev disconnects the old `MutationObserver`. Not needed for parity.

### Step 5 — Side panel entrypoint

- `git mv src/panel/panel.html src/entrypoints/sidepanel/index.html`, `git mv src/panel/panel.js src/entrypoints/sidepanel/main.js`; fix the relative imports in `main.js`.
- In `index.html`: replace the two `<link>`s by imports in `main.js` (`import "bootstrap/dist/css/bootstrap.min.css"; import "../../panel/panel.css";`) and use `<script type="module" src="./main.js"></script>`. Extension pages may be ES modules; only content and background need IIFE.
- Firefox sidebar title/icon as found in step 0 (keep "Minerva - Online Auction Assistant" and the 16/32 icons).
- `test/panel-controller.test.mjs`: point `PANEL_HTML` at the new path. The `<script…></script>` strip still matches.

### Step 6 — Switch the scripts, remove the old build

`package.json`:

```json
"build": "wxt build -b chrome && wxt build -b firefox",
"build:chrome": "wxt build -b chrome",
"build:firefox": "wxt build -b firefox",
"dev": "wxt",
"dev:firefox": "wxt -b firefox",
"package": "wxt zip -b chrome && wxt zip -b firefox",
"lint:firefox": "web-ext lint --source-dir dist/firefox --self-hosted"
```

- `npm run watch` is replaced by `npm run dev` / `dev:firefox` (WXT dev server with extension reload). Keep the name `watch` as an alias only if someone relies on it.
- Set `zip.artifactTemplate` to `{{name}}-{{version}}-{{browser}}.zip` so the zip names stay `minerva-<version>-<target>.zip`; check where WXT puts them (it defaults to the output directory; `build/` is fine to drop).
- Delete `scripts/build.mjs`, `scripts/package.mjs`, `platforms/`; `esbuild` leaves `devDependencies` (WXT brings Vite). `web-ext` can stay for `lint:firefox`.
- **Diff the generated manifests** against the last ones from the old build (`dist/*/manifest.json` saved before the switch). Expected differences only: key order, WXT's own additions. Any difference in `permissions`, `host_permissions`, `content_scripts`, `background`, `side_panel`/`sidebar_action` or `browser_specific_settings` is a bug.

### Step 7 — Documentation

- `CLAUDE.md`: commands, the "Browser differences are confined to…" invariant (`wxt.config.js` manifest function + `src/browser/side-panel.js`), the `__TARGET__` invariant (now `import.meta.env.BROWSER`, still never in `core/` or controllers), "Bundles are IIFE" (now: WXT's default for content/background, entrypoints live in `src/entrypoints/`), the `platforms/` naming note (folder is gone; "platform" no longer appears at all), static files (`public/`).
- `docs/development.md`: build/dev/install steps, output paths.
- `docs/architecture.md`: "Build time" section and its diagram (`wxt.config.js` + `SITES` + `package.json` → WXT → `dist/<browser>`), source layout.
- `README.md` only if it mentions commands or paths that changed.

## 6. Verification

For every step: `npm test` (lint, typecheck, unit + controller tests).

For steps 3–6, in **both** Chrome and Firefox, with the built extension (not only the dev server):

1. Toolbar icon opens the side panel (Chrome) / toggles the sidebar (Firefox).
2. On a configured site the badge shows `ON`, prices get a `minerva-effective-price` sibling, `n/a` for unparsable text, and there is no DOM churn once settled (the `MutationObserver` loop guard).
3. SPA navigation (`pushState`) out of and back into a site path removes and restores the annotations.
4. Saving settings in the panel updates the open tab and other open tabs; the exchange rates table loads.
5. Existing installs: load the old build, save settings, then update in place to the WXT build — the settings survive (same extension ID in Firefox, same storage keys) and the daily rates alarm is re-created.
6. `npm run lint:firefox` passes; the Firefox zip and sources zip build.

The smoke test fixture described under "Verified in real browsers" in `docs/development.md` covers 2–3 and is worth repeating here.

## 7. Risks and open points

| Risk                                                                                                          | Mitigation                                                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Code at the top level of an entrypoint runs in Node at build time and fails on `window`/`browser`              | All wiring inside `main()` / the `defineBackground` callback (steps 3–5)                                          |
| `SITES` import in `defineContentScript()` grows a dependency on an extension API later                         | `core/` already may not touch extension APIs (CLAUDE.md invariant); a build failure would surface it immediately |
| Firefox output silently becomes MV2                                                                            | `manifestVersion: 3` in `wxt.config.js`; manifest diff in step 6                                                  |
| WXT's TypeScript setup clashes with `typescript@7` / `jsconfig.json`                                           | Checked in the spike; keep `jsconfig.json` and only `extends` WXT's generated config if it helps                  |
| Another Vite/WXT upgrade churns config or entrypoint APIs                                                      | Pin WXT to a minor version; the surface we use (`defineBackground`, `defineContentScript`, `wxt/browser`) is small |
| Auto-imports leak in later and make modules unloadable from `node --test`                                      | `imports: false` stays; mention it in CLAUDE.md                                                                   |

**Afterwards, decide separately** (each one is now easy, none is required):

- TypeScript (`.js` → `.ts` file by file; WXT supports both side by side).
- `wxt/storage` `defineItem("local:settings", { fallback, version, migrations })` in place of `SettingsStore`'s hand-written `migrate()` — only together with a storage schema change, so the migration has a reason.
- Typed messaging (`@webext-core/messaging`) in place of `MessageBus` — only if the number of message types grows; the current bus already encodes the `return true` rule.
- Vitest with WXT's `fakeBrowser` in place of `node:test` + `test/support/fakes.mjs` — not needed while controllers get `ext` injected.
- `@wxt-dev/auto-icons` in place of `scripts/make-icons.mjs`.

## 8. Effort

| Step                                | Estimate  |
| ----------------------------------- | --------- |
| 0 Spike                             | 1–2 h     |
| 1–2 WXT config, icons               | 1 h       |
| 3–5 Entrypoints                     | 2–3 h     |
| 6 Scripts, cleanup, manifest diff   | 1 h       |
| 7 Docs                              | 1 h       |
| Browser verification (both targets) | 1–2 h     |
| **Total**                           | **~1 day** |
