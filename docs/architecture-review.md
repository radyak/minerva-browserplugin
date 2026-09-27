# Architecture Review — Minerva

*Date: 2026-09-27 · Scope: `src/`, `scripts/`, `platforms/`, `test/` at commit `5e446e8` · Focus: maintainability and readability for human developers, object-oriented structure, framework options.*

---

## 1. Summary

Minerva is small (≈ 1,100 lines of source code, 49 passing tests) and already has a sound basic structure: browser-independent logic lives in `src/core/`, a thin browser layer sits in `src/platform/`, and the three entry points (`background`, `content`, `panel`) only deal with lifecycle. Documentation (JSDoc, `CLAUDE.md`, `README.md`) is well above average for a project of this size.

The weak points do not lie in any single function. They lie in **how knowledge is spread across the code**. The code is organised by function, not by domain concept, so one concept (a *currency*, the *settings*, a *tab state*, a *site*) is defined in several places. Each change therefore needs edits in several files, and readers have to rebuild each concept in their head.

| Area                                      | Rating        | Main finding                                                                                                           |
| ----------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Layering (core / platform / entry points) | 🟢 good       | Clear rules, kept to consistently                                                                                      |
| Domain model                              | 🟡 fragmented | Currencies, settings, rates and state are each spread over 3–5 places                                                  |
| Naming                                    | 🔴 confusing  | "platform" has three meanings; leftovers from the scaffolding (`xbp`, `element-marker`)                                |
| Entry points (`content.js`, `panel.js`)   | 🟡 procedural | Module-level mutable state, event wiring mixed with rendering                                                          |
| Messaging / storage                       | 🟡 implicit   | Message and response shapes are only known by convention; saves are not atomic                                         |
| Tests                                     | 🟢/🟡         | Core well covered, but `settings.js` and `effective-price.js` only inside `price.test.mjs`; every entry point untested |
| Tooling                                   | 🟡            | Custom build works, but no linter, no type checking                                                                    |

**Main recommendation:** first make the domain explicit with a small set of classes and value objects (`Currency`, `Price`, `ExchangeRates`, `Settings`, `AuctionSite`, `TabState`). Then turn the entry points into controller classes with injected dependencies. After that, decide whether to adopt **WXT** as the extension framework (see section 5). Each step can be done on its own and keeps the tests green.

---

## 2. Strengths worth keeping

- **Strict layering.** `src/core/` never touches an extension API, which is why it can be tested with jsdom. Any refactoring must keep this rule.
- **Browser differences are isolated** to `platforms/*/manifest.json` and `src/platform/panel.js`.
- **The annotator is idempotent.** It writes to the DOM only on change, which prevents MutationObserver loops. The reasoning is documented in the code.
- **Pure, well-tested price parsing** (`price.js`, `currency.js`), including the ambiguous `1.359` rule.
- **Injectable dependencies where they matter:** `fetchFn` in `fetchExchangeRates`, `platforms` in `findPlatform`, `calculate` in `annotateElements`.
- **Race handling in the panel** (`ratesRequest` counter) is deliberate and documented.

---

## 3. Findings

### 3.1 Naming: "platform" means three different things 🔴

| Where                                                                                  | Meaning                              |
| -------------------------------------------------------------------------------------- | ------------------------------------ |
| `platforms/chrome`, `platforms/firefox`                                                | **Browser** targets (manifests)      |
| `src/platform/`                                                                        | **Browser API** abstraction          |
| `PLATFORMS`, `Platform`, `platformUrl`, `findPlatform` in `config.js` / `annotator.js` | **Auction sites** (biddr, numisbids) |

A new developer reading `import … from "../platform/panel.js"` next to `findPlatform(url)` has to work out from context which meaning is intended. This is the biggest readability problem in the code base.

There are also leftovers from the scaffolding that no longer match the product:

- `ANNOTATION_CLASS = "xbp-price-markup"`, `data-xbp-source`, `data-xbp-unparsable` (xbp = "cross-browser plugin")
- Gecko ID `element-marker@example.com`, package name `browser-plugin`, and a `package.json` description that talks about "marks a configured element"
- `config.js` still calls its values "PLACEHOLDERS for phase 1"
- `README.md` mentions an `example.com` entry that no longer exists

**Measure:** rename the auction sites to **`AuctionSite` / `SITES`** (fields `origin`, `paths`, `priceSelectors`), and the browser layer to **`src/browser/`** (`platforms/` can stay as the build target folder, or become `targets/`). Change the `xbp` prefix to `minerva` (CSS class and data attributes). Note that changing the Gecko ID breaks updates for existing Firefox installs, so do it only before the first AMO release, or leave it alone.

### 3.2 Domain concepts are spread across files 🟡

The clearest example is **currency**. Adding a currency (e.g. JPY) currently needs changes in:

1. `settings.js` → `CURRENCIES`
2. `currency.js` → `TOKENS` (recognised tokens)
3. `currency.js` → `SYMBOLS` (output symbol)
4. `panel.html` → hard-coded `<option>` elements
5. (implicitly) `panel.html` → the default `EUR` in `#shipment-currency`

Other concepts are spread the same way:

| Concept                                          | Defined / assumed in                                                                                                                                                                 |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Is this token an ISO code?" (`/^[A-Z]{3}$/`)    | `currency.js` (2×), `price.js` (`isCode`)                                                                                                                                            |
| Setting ranges                                   | `settings.js` (`RANGES`) **and** `panel.html` (`min`/`max`)                                                                                                                          |
| Storage schema                                   | `settings.js` (`SETTINGS_STORAGE_KEYS`), `exchange-rates.js` (`EXCHANGE_RATES_STORAGE_KEY = "settings.exchangeRates"`), `content.js` (`STORAGE_KEYS`)                                |
| Tab state `{active, annotated, unparsable, url}` | `annotator.js` (return value), `content.js` (`sync`, change comparison), `background.js` (fallback object), `panel.js` (`renderStatus`)                                              |
| Exchange rates                                   | `ExchangeRates` (base → others) **and** `ConversionRates` (others → base, inverted). Both are `Record<string, number>`, so only the variable name tells you which direction is meant |

There are also dependency-direction problems: `exchange-rates.js` imports `CURRENCIES` from `settings.js`, which means the *rates* module depends on the *user settings* module. `background.js` imports `isTargetUrl` from `annotator.js`, so the service worker bundle pulls in the whole DOM annotator, price parser and currency parser just to match a URL.

### 3.3 `annotator.js` has two responsibilities 🟡

`annotator.js` contains (a) the DOM annotation (`annotateElements`, `removeAnnotations`) and (b) site lookup and orchestration (`findPlatform`, `isTargetUrl`, `syncDocument`). These change for different reasons. Site matching belongs next to the site configuration; the annotator should only know "selectors in, DOM out".

`annotateElements` also does three jobs in one loop: finding elements (including the wrapper rule), pricing (`convertPrice` + `calculate`) and rendering (creating and updating the sibling). An `AnnotationView` / renderer split would make the idempotency rule the responsibility of exactly one small class.

The `calculate` strategy parameter exists, but `syncDocument` never passes it through. The per-site calculation mentioned in `CLAUDE.md` therefore has no place to live yet.

### 3.4 Entry points are procedural scripts with global state 🟡

- **`content.js`** keeps `lastState`, `settings` and `rates` as module-level `let` variables. Those variables are changed from four async sources: load, `SYNC_REQUEST`, `storage.onChanged` and mutations. The "did the state change?" comparison is written out field by field.
- **`panel.js`** (173 lines) mixes DOM lookups, rendering, validation, persistence, the rates fetch and message handling at the top level. It keeps three pieces of hidden state (`ratesRequest`, `selectedRates`, `savedTimer`). The save flow depends on the `selectedRates` promise that `applyCurrency()` set as a side effect. That is hard to follow and cannot be tested.
- **`background.js`**: the `onMessage` handler is an `if` chain, and the `return true` rule (important, easy to lose) is repeated in both content and background.

None of these three files can be tested today, because they run on import and use `ext`/`document` directly.

### 3.5 Save flow: not atomic, several syncs 🟡

On Save, the panel writes each setting **as its own `storage.local.set` call** (`Promise.all` over `storageSet`), including the rates. Every call fires its own `storage.onChanged` event in every open tab. Each tab then reloads the settings and syncs again. If the currency is written before the matching rates, the tab can briefly see the *new* currency with *old* rates (depending on timing), so `conversionRates` returns only `{[currency]: 1}` and the prices flash to `n/a`. After that, `GET_ACTIVE_STATE` triggers another sync.

**Measure:** save everything in **one** `storage.local.set({ settings: {...}, exchangeRates: {...} })` call (one object per concern instead of dotted keys). That gives one `onChanged` event and a consistent state.

### 3.6 Exchange rates are owned by the panel 🟡 (design question)

Rates are only fetched while the panel is open. A user who changes the currency and never opens the panel again works with rates of any age, and nothing expires them. Architecturally, this is **background work**: a `RatesService` in the background with a TTL (e.g. daily through `alarms`) that the panel only displays. The current solution is documented as intentional, so this is a decision to make, not a bug.

### 3.7 Tests and tooling 🟡

- `settings.js` (`readSettings` validation) and `effective-price.js` have no test files of their own; their cases live in `price.test.mjs`.
- None of the entry points are tested (see 3.4).
- `CLAUDE.md` says there is no linter or formatter. Style is enforced by review alone.
- The JSDoc types are good but never checked. Mismatches (e.g. `PriceCurrency` vs. `CurrencyMatch`) would go unnoticed.
- `scripts/build.mjs` copies static files through a hand-written list (`copyStaticAssets`). Every new file means editing the build script.

---

## 4. Proposed target model (OOP)

The guiding idea: **one class per domain concept, owning its data *and* its rules.** Pure functions stay where they are the better tool (e.g. glob matching); classes are used where state and behaviour belong together. Everything under `core/` stays free of extension APIs.

### 4.1 Domain (`src/core/`)

```text
core/
  currency/
    Currency.js          value object: code, symbol, tokens; Currency.ALL, Currency.of("EUR")
    CurrencyDetector.js  finds the currency closest to the number (today: findCurrency)
  price/
    PriceFormat.js       separators, grouping, prefix/suffix, currency notation
    Price.js             Price.parse(text) → Price { amount, currency, format }
                         price.withAmount(value, currency).toString()
  rates/
    ExchangeRates.js     { base, date, rates }; rateFrom(code); static fromJSON(json, base)
    RatesClient.js       fetch + validation, fetch function injectable
  pricing/
    PriceCalculator.js   interface: calculate(price, context) → number | undefined
    EffectivePriceCalculator.js   premium + shipping + conversion
  settings/
    Settings.js          value object: static fromStorage(raw), toStorage(), static RANGES
  sites/
    AuctionSite.js       origin, paths, priceSelectors, calculator; matches(url)
    SiteRegistry.js      find(url), matchPatterns()   (also used by the build)
    sites.config.js      the SITES list (data only)
  annotation/
    PriceAnnotator.js    findTargets(doc, selectors) + wrapper rule
    AnnotationView.js    the only class that writes to the DOM; idempotent
  state/
    TabState.js          value object: active, annotated, unparsable; equals(other)
  messaging/
    messages.js          message types + factory functions (syncRequest(), stateChanged(state))
```

Sketches of the central classes:

```js
/** One currency with everything needed to recognise and write it. */
export class Currency {
  static EUR = new Currency("EUR", "€", ["EUR", "€"]);
  static USD = new Currency("USD", "$", ["US$", "USD", "$"]);
  static GBP = new Currency("GBP", "£", ["GBP", "£"]);
  static CHF = new Currency("CHF", "CHF", ["SFr.", "Fr.", "CHF"]);
  static ALL = Object.freeze([Currency.EUR, Currency.USD, Currency.GBP, Currency.CHF]);

  static of(code) { return Currency.ALL.find((c) => c.code === code) ?? null; }
  static isCode(token) { return /^[A-Z]{3}$/.test(token); }

  constructor(code, symbol, tokens) { Object.assign(this, { code, symbol, tokens }); Object.freeze(this); }
  notationFor(inputToken) { return Currency.isCode(inputToken) ? this.code : this.symbol; }
}
```

Adding a currency is then **one line**. The panel builds its `<select>` from `Currency.ALL`.

```js
/** Rates published for one base currency; the only place that knows the direction. */
export class ExchangeRates {
  constructor(base, date, rates) { … }
  /** Factor that converts 1 `code` into `base` (undefined when unknown). */
  factorFrom(code) { return code === this.base ? 1 : this.rates[code] && 1 / this.rates[code]; }
  convert(amount, from) { const f = this.factorFrom(from); return f === undefined ? undefined : amount * f; }
  static empty(base) { return new ExchangeRates(base, "", {}); }
}
```

This removes the `ExchangeRates` vs. `ConversionRates` confusion and the separate `conversionRates()` function.

```js
export class AuctionSite {
  constructor({ name, origin, paths, priceSelectors, calculator = new EffectivePriceCalculator() }) { … }
  matches(url) { return urlOnOrigin(url, this.origin, this.paths); }
  get matchPattern() { return matchPatternFor(this.origin); }
}

export class SiteRegistry {
  constructor(sites) { this.sites = sites; }
  find(url) { return this.sites.find((site) => site.matches(url)) ?? null; }
  matchPatterns() { return [...new Set(this.sites.map((s) => s.matchPattern))]; }
}
```

The background then only imports `SiteRegistry`, not the annotator. Per-site calculation becomes a constructor argument.

### 4.2 Browser layer (`src/browser/`, formerly `src/platform/`)

```text
browser/
  ext.js                 API alias (as today)
  SidePanel.js           Chrome sidePanel vs. Firefox sidebarAction (as today, platform/panel.js)
  SettingsStore.js       load(): {settings, rates}; save(settings, rates) → ONE storage.set; onChange(cb)
  MessageBus.js          on(type, asyncHandler) – handles the `return true` rule in one place;
                         send(msg), sendToTab(tabId, msg)
```

`MessageBus.on(MSG.SYNC_REQUEST, async () => …)` removes the most common source of errors named in `CLAUDE.md` ("easy to drop when editing") for good.

### 4.3 Entry points as controllers

```js
// content/ContentController.js
export class ContentController {
  #state = TabState.inactive();
  constructor({ document, location, sites, store, bus, annotator }) { … }

  async start() { await this.#reload(); this.#listen(); this.sync("load"); }
  sync(reason) {
    const site = this.sites.find(this.location.href);
    const state = site ? this.annotator.annotate(site, this.#settings, this.#rates) : this.annotator.clear();
    if (!state.equals(this.#state)) this.bus.send(stateChanged(state, reason));
    return (this.#state = state);
  }
}

// content/content.js – just the wiring
new ContentController({ document, location, sites: SITES, store: new SettingsStore(ext), bus: new MessageBus(ext),
                        annotator: new PriceAnnotator(document) }).start();
```

Split the panel the same way into `PanelController` + three small views (`SettingsFormView`, `StatusView`, `RatesView`) + a `RatesService` that encapsulates the "only the latest request counts" rule. Because every dependency is passed in through the constructor, all controllers can be tested with jsdom and a fake `ext` object.

---

## 5. Framework options

### 5.1 Extension framework: **WXT** (recommended option, not a requirement)

[WXT](https://wxt.dev) (Vite-based) covers almost exactly what `scripts/`, `platforms/` and `src/platform/` implement by hand today:

| Built by hand today                                            | WXT equivalent                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `scripts/build.mjs` (esbuild, IIFE, `__TARGET__`, static copy) | `wxt build -b chrome/firefox`, `import.meta.env.BROWSER`                                                  |
| Two manifests with `$VERSION` / `$CONTENT_MATCHES`             | Manifest generated from `wxt.config.ts` + `defineContentScript({ matches })`                              |
| `scripts/package.mjs`                                          | `wxt zip` (including a sources zip for AMO)                                                               |
| `src/platform/browser.js`                                      | `import { browser } from "wxt/browser"`                                                                   |
| `storageGetMany` + key constants + `readSettings`              | `storage.defineItem("local:settings", { fallback, version, migrations })`, including `.watch()`           |
| `npm run watch` + manual reload                                | HMR / automatic extension reload in Chrome and Firefox                                                    |
| Hand-written `MSG` + `return true`                             | [`@webext-core/messaging`](https://webext-core.aklinker1.io/messaging) (typed `defineExtensionMessaging`) |

**For:** less custom infrastructure; a structure new contributors already know; typed storage with **migrations** (useful once the storage schema is changed as in 3.5); first-class TypeScript. **Against:** a larger dependency with its own conventions (file-based entry points under `entrypoints/`); `SITES` has to stay importable from `wxt.config.ts` to derive the match patterns (possible). The current build is small and works. The switch pays off from the next larger feature on (more sites, options page, background rates service).

**Not recommended:** Plasmo (React-centred, much heavier than a single small panel needs, less active maintenance), plain `webextension-polyfill` alone (only solves what `ext` already does).

### 5.2 Panel UI

The panel is a form, a status badge and a table. A full SPA framework (React/Vue) would be too much. Options:

- **Stay with vanilla + the view classes from 4.3** — enough for the current size.
- **Lit** or **Preact + htm** (≈ 4–5 kB) once the panel gets more interactive (e.g. per-site settings, rate history). Declarative templates replace the manual `createElement` / `classList` work in `renderRates` and `renderStatus`.

Keep Bootstrap. It works fine and is only CSS.

### 5.3 Types and code quality

- **Short term:** `// @ts-check` / `jsconfig.json` with `checkJs: true` + `tsc --noEmit` in `npm test`. The existing JSDoc gets checked without changing a line.
- **Medium term (together with WXT):** migrate to TypeScript. Value objects like `Settings`, `TabState`, `ExchangeRates` and the messages benefit most.
- **ESLint + Prettier** with the current style (2 spaces, double quotes, semicolons), plus `eslint-plugin-jsdoc` to enforce the rule "JSDoc on every export".

---

## 6. Refactoring plan

Each step is its own commit (or PR), keeps `npm test` green and changes no behaviour unless noted.

### Phase 1 — Quick wins (low risk, ~½ day)

1. **Tooling:** add ESLint + Prettier and `checkJs` (`tsc --noEmit`) to `npm test`.
2. **Own test files** for `readSettings` and `calculateEffectivePrice`: move their cases out of `price.test.mjs` and add the missing ones (range bounds, premium 0/100, non-finite rates).
3. **Remove duplicates:** move `isCode` to `currency.js` and use it in `price.js`; remove the unused `storageGet`.
4. **Fix the documentation drift:** `config.js` "PLACEHOLDERS" comment, the `example.com` note in the README, `package.json` name/description.

### Phase 2 — Make the domain explicit (~1–2 days)

5. **Introduce `Currency`** as a single table; derive `TOKENS`, `SYMBOLS`, `CURRENCIES` from it; build the panel `<select>` dynamically.
6. **`ExchangeRates` class** replaces `ExchangeRates`/`ConversionRates`/`conversionRates()`; move `CURRENCIES` out of `settings.js` (fixes the dependency direction).
7. **`Settings` value object** with `fromStorage` / `toStorage` / `RANGES`; the panel sets `min`/`max` from `Settings.RANGES`.
8. **`TabState` value object** with `equals()` and `inactive()`; content, background and panel use it instead of object literals.
9. **Rename the auction sites:** `Platform` → `AuctionSite`, `PLATFORMS` → `SITES`, `platformUrl` → `origin`, …; move site matching out of `annotator.js` into `SiteRegistry` (the background no longer imports the annotator).

### Phase 3 — Browser layer and entry points (~1–2 days)

10. **Rename `src/platform/` → `src/browser/`**, add `MessageBus` (with the `return true` rule built in) and `SettingsStore`.
11. **Save atomically (changes behaviour):** storage schema `{ settings: {...}, exchangeRates: {...} }` in one `set` call. Read the old dotted keys once and migrate them.
12. **`ContentController`, `BackgroundController`, `PanelController` + views**, with constructor injection; first controller tests with jsdom and a fake `ext`.
13. **Split `annotateElements`** into `PriceAnnotator` (finding elements, wrapper rule, pricing) and `AnnotationView` (idempotent DOM writes). Change the `xbp` prefix to `minerva`.

### Phase 4 — Strategic (decide separately)

14. **Move the exchange rates into the background** (`RatesService` with TTL/`alarms`); the panel only displays them.
15. **Migrate to WXT** (+ TypeScript, `@webext-core/messaging`, `storage.defineItem` with migration from step 11). Easiest after phase 3, because the controllers then only need to be moved into `entrypoints/`.
16. **Per-site `PriceCalculator`**, once a second site needs a different calculation.

### Order and dependencies

```text
Phase 1 ──► 5 ──► 6 ──► 7 ──► 8 ──► 9 ──► 10 ──► 11 ──► 12 ──► 13 ──► (14, 15, 16 independent of each other)
```

---

## 7. Invariants to keep during the refactoring

These rules from `CLAUDE.md` are architecturally important and must survive every step. Ideally, back each one with a test:

- `core/` never touches an extension API (lint rule: `no-restricted-imports` for `../browser/*` inside `core/`).
- DOM writes only on change (a test: a second `annotate` on an unchanged DOM produces **no** mutation).
- Never annotate our own output, and read the price text without annotations (existing tests).
- Browser branches only in the browser layer (with WXT: `import.meta.env.BROWSER` only there).
- Keep the `[by AI]` marker in commit subjects.
