# CLAUDE.md

Minerva — a cross-browser (Chrome + Firefox) MV3 WebExtension that reads the price out of a
configured element on a configured auction site, adds a surcharge (+20%) and inserts the result
as a sibling element next to it. A side panel shows status and holds a persisted note field.

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
- **`src/core/config.js` is the single source of truth.** The manifests carry `$VERSION` and
  `$CONTENT_MATCHES` placeholders that `scripts/build.mjs` resolves from `package.json` and from
  `CONTENT_SCRIPT_MATCHES`. Changing what the extension targets should mean editing only
  `config.js`.
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
  matters because `TARGET_SELECTOR` is a site selector that may well match the sibling too.
- **`CONTENT_SCRIPT_MATCHES` entries are WebExtension match patterns** and cannot contain a port
  or glob syntax beyond what match patterns allow. Port-specific or fine-grained gating belongs in
  `TARGET_URL_PATTERN`, which is matched by our own tiny glob matcher (`src/core/url-matcher.js`,
  `*` only).
- **`test/annotator.test.mjs` derives its target URL from the real `TARGET_URL_PATTERN`**
  (`replaceAll("*", "")`). It uses its own `.price` selector so `TARGET_SELECTOR` can change
  freely, but a `TARGET_URL_PATTERN` that does not reduce to a usable URL that way will break the
  suite. Adjust the test rather than working around it in the source.
- **Price formatting mirrors the input notation** (currency position, decimal/grouping separators,
  surrounding text). The one ambiguous rule: a single separator followed by exactly three digits
  is read as *grouping* (`1.359` = 1359), anything else as a decimal separator (`1.35` = 1.35).
  Change `src/core/price.js` only with a matching case added to `test/price.test.mjs`.
- `dist/`, `build/` and `.poc/` are gitignored. `.poc/` holds unrelated reference extensions
  (Mozilla samples etc.) — not part of the build, safe to ignore.

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
