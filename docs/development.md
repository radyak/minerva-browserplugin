# Development

## Build and test

```bash
npm install
npm run build            # both browsers -> dist/chrome, dist/firefox
npm run build:chrome     # one browser only (or :firefox)
npm run dev              # dev mode: Chrome with the extension loaded, auto-reload on change
npm run dev:firefox      # the same for Firefox
npm test                 # lint + typecheck + unit and controller tests
npm run format           # apply Prettier and ESLint fixes
npm run package          # dist/<name>-<version>-<browser>.zip, plus the sources zip for AMO
```

The build is [WXT](https://wxt.dev) (Vite underneath), configured in `wxt.config.ts`.
It finds the entry points in `src/entrypoints/` (`background.ts`, `content.ts`,
`sidepanel/`), generates the manifest for each browser - version from `package.json`,
content script `matches` and `host_permissions` from `matchPatterns(SITES)`, `side_panel`
for Chrome and `sidebar_action` for Firefox - bundles content script and background as
IIFE, scales `src/assets/icon.png` into `icons/<size>.png` (`@wxt-dev/auto-icons`, sharp;
greyscale in dev mode, so the dev build is easy to tell apart) and inlines the icon
referenced by `content.css` (`src/assets/minerva-64.png`) as a `data:` URL. Bootstrap's CSS is imported by the side panel and
bundled with `panel.css`. Dev mode writes to `dist/<browser>-dev` and starts a
throwaway browser profile with the extension loaded (via `web-ext`).

The source is TypeScript (strict, `tsconfig.json`), the tests are JavaScript checked
through their JSDoc (`test/tsconfig.json`); `npm run typecheck` runs both. `node --test`
loads the `.ts` sources directly - Node 24 strips the types - so the code sticks to
erasable TypeScript syntax (no `enum`, `namespace` or parameter properties).

Tests use `node:test` and jsdom. Core modules are tested directly, the browser layer and the three controllers with fakes (`test/support/fakes.mjs`); the panel test runs against the real `src/entrypoints/sidepanel/index.html`. `CLAUDE.md` lists the conventions and invariants to keep when changing the code.

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main` and every pull request: lint, typecheck, unit tests, the build of both targets, the AMO linter on the Firefox build and `npm run package`. The zips are attached to the run as the `minerva-extensions` artifact.

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

`npm run dev` / `npm run dev:firefox` start a throwaway profile with the extension
already loaded and reload it on change; `npm run lint:firefox` runs the AMO validator
on `dist/firefox`.

## Verified in real browsers

After the switch to WXT (phase 1 of [`dev/archive/wxt-migration-plan.md`](dev/archive/wxt-migration-plan.md)),
the built extension got a basic manual test in the browser by the maintainer (2026-10-31, R0
of the plan).


Before the switch from the +20% surcharge to the shipment setting, built
artifacts were smoke tested against a local fixture page in real browsers
(Firefox via geckodriver, Chrome 145 via CDP), with identical results in both:
`500 EUR` gets a `600 EUR` sibling and a late-rendered `USD 1.359` gets
`USD 1.630,80`; changing the price text in place to `1.234,56 EUR` updates the
sibling to `1.481,47 EUR`; an element reading `sold out` gets an `n/a` sibling,
and swapping the two texts swaps the siblings accordingly, with zero DOM churn
once settled; the annotations disappear on a non-matching URL and come back
after a `history.pushState` into the target URL.
