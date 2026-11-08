# Development

## Build and test

```bash
npm install
npm run build            # both browsers -> dist/chrome, dist/firefox
npm run build:chrome     # one browser only (or :firefox)
npm run dev              # dev mode: Chrome with the extension loaded, auto-reload on change
npm run dev:firefox      # the same for Firefox
npm test                 # lint + typecheck + unit, controller and panel tests
npm run test:watch       # Vitest in watch mode
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
referenced by `content.css` (`src/assets/minerva-64.png`) as a `data:` URL. The side panel is React (`@wxt-dev/module-react` adds Vite's React plugin); Bootstrap's CSS is imported by it and
bundled with `panel.css`. Dev mode writes to `dist/<browser>-dev` and starts a
throwaway browser profile with the extension loaded (via `web-ext`).

The source is TypeScript (strict, `tsconfig.json`), the tests are TypeScript too, checked less
strictly (`test/tsconfig.json`); `npm run typecheck` runs both.

Tests run on [Vitest](https://vitest.dev) (`vitest.config.ts`, `npm run test:unit`, `npm run test:watch`) with WXT's `WxtVitest()` plugin, which applies `wxt.config.ts` and replaces the extension API with WXT's in-memory `fakeBrowser`. Core modules are tested directly against jsdom documents, the browser layer and the two controllers with fakes (`test/support/fakes.ts`), the React panel with Testing Library in a jsdom environment (`test/panel.test.tsx`). `CLAUDE.md` lists the conventions and invariants to keep when changing the code.

The environment variable `VERSION` (e.g. `VERSION=1.2.3 npm run build`) sets the build version shown at the bottom of the panel, `0.0.0-dev` by default. The manifest keeps the `package.json` version, since browsers only accept dot-separated numbers there.

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main`, every pull request and every pushed release tag (`v1.2.3`, also with a suffix such as `v1.2.3-rc.1`): lint, typecheck, unit tests, the build of both targets, the AMO linter on the Firefox build and `npm run package`. The zips are attached to the run as the `minerva-extensions` artifact.

Every run sets `VERSION` for its later steps: on a tag build the tag without its `v` (`1.2.3`), otherwise the latest release tag reachable from the commit plus the short commit hash (`1.2.3+abc1234`). As long as no release tag exists, the version from `package.json` stands in for the tag. The build picks it up from the environment, so the panel shows it.

On a release tag the workflow also publishes the release page as the repository's GitHub Page (`https://radyak.github.io/minerva-browserplugin/`): the `ci` job assembles `site/` (a static page, `{{VERSION}}` replaced with the version), the generated `icons/128.png` and the zips as `downloads/minerva-<VERSION>-<browser>.zip` into `public/` and uploads it as the Pages artifact, the `pages` job deploys it (`actions/deploy-pages`, environment `github-pages`). This needs *Settings → Pages → Source: GitHub Actions* in the repository; a release candidate tag (`v1.2.3-rc.1`) replaces the page as well.

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

The simplifications, the switch to Vitest and the React panel of 2026-11-01
([review](dev/framework-and-simplification-review.md#6-outcome)) are covered by the tests,
the builds and the AMO linter, but **not yet checked in a browser**: the panel finding the
active tab in Chrome's side panel and Firefox's sidebar, following tab switches, Save
recalculating the page, and the version shown at the bottom.

Before the switch from the +20% surcharge to the shipment setting, built
artifacts were smoke tested against a local fixture page in real browsers
(Firefox via geckodriver, Chrome 145 via CDP), with identical results in both:
`500 EUR` gets a `600 EUR` sibling and a late-rendered `USD 1.359` gets
`USD 1.630,80`; changing the price text in place to `1.234,56 EUR` updates the
sibling to `1.481,47 EUR`; an element reading `sold out` gets an `n/a` sibling,
and swapping the two texts swaps the siblings accordingly, with zero DOM churn
once settled; the annotations disappear on a non-matching URL and come back
after a `history.pushState` into the target URL.
