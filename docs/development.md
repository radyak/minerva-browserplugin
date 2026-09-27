# Development

## Build and test

```bash
npm install
npm run build            # both targets -> dist/chrome, dist/firefox
npm run build:chrome     # one target only
npm run watch            # rebuild on change (unminified, inline source maps)
npm test                 # lint + typecheck + unit and controller tests
npm run format           # apply Prettier and ESLint fixes
npm run package          # zips dist/<target> -> build/<name>-<version>-<target>.zip
npm run icons            # scale icons/base.png to the icon sizes (sharp)
```

`scripts/build.mjs` bundles each entry point with esbuild (IIFE - content scripts
cannot be ES modules), copies the static assets plus
`node_modules/bootstrap/dist/css/bootstrap.min.css` into `dist/<target>/vendor/`
and resolves the `$VERSION` / `$CONTENT_MATCHES` placeholders in the manifest.

Tests use `node:test` and jsdom. Core modules are tested directly, the browser layer and the three controllers with fakes (`test/support/fakes.mjs`); the panel test runs against the real `panel.html`. `CLAUDE.md` lists the conventions and invariants to keep when changing the code.

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

## Verified in real browsers

Before the switch from the +20% surcharge to the shipment setting, built
artifacts were smoke tested against a local fixture page in real browsers
(Firefox via geckodriver, Chrome 145 via CDP), with identical results in both:
`500 EUR` gets a `600 EUR` sibling and a late-rendered `USD 1.359` gets
`USD 1.630,80`; changing the price text in place to `1.234,56 EUR` updates the
sibling to `1.481,47 EUR`; an element reading `sold out` gets an `n/a` sibling,
and swapping the two texts swaps the siblings accordingly, with zero DOM churn
once settled; the annotations disappear on a non-matching URL and come back
after a `history.pushState` into the target URL.
