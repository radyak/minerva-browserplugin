# UI Framework and Simplification Review — Minerva

*Date: 2026-11-01 · Scope: `src/`, `test/` at commit `2e40cbb` (branch `feature/WXT-migration`) · Question: would React (or a similar framework), supported by WXT, make the code base simpler, and what else can be simplified without risking functionality?*

---

## 1. Summary

Minerva has ≈ 2,850 lines of TypeScript in `src/` (plus 180 lines of panel HTML) and ≈ 2,450 lines of tests. A UI framework can only help in **one of the three contexts, the side panel** (≈ 580 lines of TS + the HTML, about a quarter of the code). The content script writes a few sibling elements into a foreign page under a `MutationObserver` and must stay hand-written; the background has no UI.

Most of the "this feels like a lot" comes from somewhere else: **ceremony around small concepts** (classes with constructor + `readonly` fields + `Object.freeze` + `from()` + `equals()` + `toJSON()` for what is plain data), **one message relay that could be skipped**, and **migration code for storage layouts that may never have been installed anywhere**. Those can be simplified independently of any framework, at lower risk.

**Recommendation, in order:**

1. **Framework-independent clean-ups** (section 4): plain data instead of value-object classes where nothing but data is carried, functions instead of single-method class hierarchies, drop the pre-0.1.0 migration if no such install exists. Low risk, all covered by the existing tests.
2. **Move the tests to Vitest** (`WxtVitest()` + `fakeBrowser`). This is the precondition for any JSX framework, and on its own removes several of the constraints in `CLAUDE.md`.
3. **Rewrite the side panel in Preact (or React) with JSX.** Worth it, but only after 1 and 2: it roughly halves the panel and deletes the `index.html` ↔ view-class coupling, but it does not touch the parts that are hard to understand.

This revises the earlier "no UI framework for the panel" decision ([`architecture-review.md`](architecture-review.md#52-panel-ui), [`wxt-migration-plan.md`](wxt-migration-plan.md#4-decisions-that-stay)): the panel has since grown to six classes (controller, five views, `SelectedRates`) and a settings-source indicator, which is the point the review named for reconsidering.

---

## 2. Where the complexity actually is

| Area                                                                                          | Lines (TS) | Complexity is…                                                                             | Framework helps? |
| --------------------------------------------------------------------------------------------- | ---------: | ------------------------------------------------------------------------------------------ | ---------------- |
| Price parsing and formatting (`price.ts`, `currency/`)                                        |       ~320 | inherent: notation rules, ambiguity, currency detection                                    | no               |
| Annotation (`annotation/`)                                                                    |       ~190 | inherent: idempotent writes, wrapper rule, never annotating our own output                 | no               |
| Sites, URL matching, IDs (`sites/`)                                                           |       ~290 | partly ceremony: four classes/modules for "origin + paths + selectors + two ID extractors" | no               |
| Settings, scopes, book, key (`settings/`)                                                     |       ~280 | partly ceremony: scope lookup is real logic, the class shells around it are not            | no               |
| `TabState`, messages                                                                          |       ~175 | mostly ceremony: a flat record with hand-written validation, equality and serialisation    | no               |
| Storage (`SettingsStore`)                                                                     |       ~190 | half of it is `migrate()` for the two layouts before the current one                       | no               |
| Controllers (content, background)                                                             |       ~330 | real lifecycle work (observer, teardown, alarms), plus one relay (`GET_ACTIVE_STATE`)       | no               |
| **Side panel** (`PanelController`, 5 views, `SelectedRates`, `index.html`)                    |  ~580 + 180 | **imperative DOM**: `getElementById` lookups, manual `hidden`/`classList`/`textContent`, a race guard | **yes**          |

---

## 3. A UI framework for the side panel

### 3.1 What it would replace

| Today                                                                                                  | With a component framework                                                                                  |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Markup in `index.html`, found again by ID in five view constructors (a renamed ID breaks silently)     | Markup lives in the component that renders it; `index.html` shrinks to `<div id="root">`                     |
| `render()`/`show*()` methods setting `hidden`, `textContent`, `className`, `aria-*` by hand            | `{state.onAuction && <AuctionHeader …/>}`, attributes bound to state                                         |
| `PanelController` holding four pieces of mutable state and calling each view in the right order       | `useActiveTab()`, `useResolvedSettings(key)`, `useRates(currency)` hooks; rendering follows from the state   |
| `SelectedRates` (latest-request counter) for currency switches                                         | the standard effect clean-up (`let cancelled = false; return () => { cancelled = true }`) in `useRates`      |
| `SettingsFormView`: `isChanged()`, `showChanged()`, `validate()`, input/`change` listeners, help toggles | controlled inputs; "changed" is derived (`!equal(draft, shown)`), help toggle is a 10-line component          |
| `RatesView`/`AuctionView` building rows and pills with `createElement`                                 | `rates.map(r => <tr>…</tr>)`, `SCOPES.map(s => <Pill active={…}/>)`                                          |

Expected result: the panel goes from 7 TS files + 180 lines of HTML to about 4–5 `.tsx` files with roughly **40–50 % fewer lines**, and the markup and the code that changes it sit together. `src/core/` (Settings, `SettingsBook`, `ExchangeRates`, `Currency`) is reused unchanged; the store and the bus are passed in the same way (props or a small context), so the panel stays testable with fakes.

### 3.2 Candidates

WXT has official modules for React, Vue, Svelte and Solid (`@wxt-dev/module-*`, they add the Vite plugin and set up `.tsx`/`.vue`/`.svelte` entry points). Preact needs only `@preact/preset-vite` in `vite` of `wxt.config.ts`.

| Option                                | Runtime (min+gz) | For                                                                                  | Against                                                                                             |
| ------------------------------------- | ---------------: | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Preact + JSX** (recommended)        |            ~5 kB | React API and knowledge; tiny; `@testing-library/preact`; switch to React is an alias | no official WXT module (one Vite plugin line instead)                                               |
| React + JSX (`@wxt-dev/module-react`) |          ~45 kB | most familiar, official WXT module, largest ecosystem                                 | ~9× the size for a three-section panel (irrelevant for load time, visible in the AMO source review)  |
| Svelte (`@wxt-dev/module-svelte`)     |            ~3 kB | least code of all, reactive stores fit `storage.watch()`                              | a second language and compiler; component tests need the Svelte toolchain                          |
| Vue / Solid                           |       ~35 / ~8 kB | official modules                                                                     | no advantage here over Preact/React, less common in extension examples                              |
| Lit / Preact + `htm` (no JSX)         |        ~5–6 kB | runs under `node --test` without a build step                                        | templates in strings are not type-checked; less of a simplification                                |

**Keep Bootstrap** (CSS only, works with every option). **Do not use a framework in the content script:** WXT's `createShadowRootUi`/`createIntegratedUi` mount one UI at one anchor, while Minerva inserts one sibling per price into markup the page re-renders; a virtual DOM there would fight the page's own scripts and our `MutationObserver`, and the idempotency rule would be harder to guarantee. `AnnotationView` stays the only writer to the page.

### 3.3 The real cost: the test runner

`node --test` runs the `.ts` sources through Node's type stripping, which **does not handle JSX/`.tsx`**. A JSX panel therefore needs a transforming runner, i.e. **Vitest with `WxtVitest()`** from `wxt/testing`. That migration is mostly mechanical (`node:test`'s `test`/`describe` → Vitest's, `node:assert` can stay) and removes constraints on its own:

- no `erasableSyntaxOnly`, no mandatory `.ts` extension in imports, WXT path aliases usable;
- `fakeBrowser` everywhere, so `SettingsStore`'s "put `fakeBrowser` on `globalThis` before a dynamic import" test setup goes away;
- tests can move to TypeScript (`*.test.ts`) instead of JSDoc-checked `.mjs`.

The 412-line `panel-controller.test.mjs` has to be rewritten against the components (Testing Library: render, type, click, assert on text). Its *cases* must be carried over one by one — that file is the main guard against losing behaviour (emptied input keeps its value, stale rates after fast currency switches, the tab moving on while settings load, `Saved.` note, source pills).

---

## 4. Simplifications without a framework

Ordered by value/risk. Each keeps behaviour and is covered by existing tests unless noted.

1. **Drop the pre-current storage migration — if nothing to migrate exists.** `SettingsStore.migrate()` and its helpers (`LEGACY_KEYS`, `GLOBAL_KEY`, `readLocal`, `isSingleRates`, single-rates handling in `ratesFrom`; ≈ 90 lines plus a large part of `settings-store.test.mjs`) convert the 0.1.0 and pre-0.1.0 layouts. The Gecko ID is still `element-marker@example.com`, so there is no AMO install; if there is also no Chrome Web Store or shared install, delete it and start with WXT's item versioning from here. *Needs a decision, not a test.*
2. **Function instead of a class hierarchy for `PriceCalculator`.** A base class whose only method throws, one subclass, and an ESLint disable: `type PriceCalculator = (amount, currency, settings, rates) => number | undefined` plus `effectivePrice` as a function does the same; a site with other fees passes another function.
3. **Plain data for pure data carriers.** `TabState`, `AuctionKey`, `SettingsScope`, `AuctionSite` and `SiteRegistry` are records with a constructor that copies every field, `readonly` *and* `Object.freeze`, and hand-written `from()`/`equals()`/`toJSON()`. As `type`s plus a few functions (`parseTabState(data)`, `sameKey(a, b)`, `findSite(sites, url)`), the `toJSON()`/`from()` round trips around messages disappear, because the plain object *is* the wire format. Keep classes where they hide real logic or invariants: `ExchangeRates` (rate direction), `SettingsBook` (lookup), `Settings` (ranges/validation), `Currency`. `TabState` can carry an `AuctionKey` instead of repeating `site`/`house`/`auction`, which also removes the duplicated `id()` helper. `readonly` in the types is enough; the `Object.freeze` calls add nothing the compiler does not already enforce.
4. **Fewer stored copies of the constructor dependencies.** Controllers declare `Deps`, then copy every dependency into a public `readonly` field one by one (needed because parameter properties are not erasable). A single `readonly #deps: Deps` (or destructuring where used) halves the constructors. With Vitest (section 3.3) parameter properties become possible again, if preferred.
5. **Let the panel ask the tab directly (`GET_ACTIVE_STATE`).** Today: panel → background → `SYNC_REQUEST` to the active tab → answer back through the background, with a URL-only fallback when no content script answers. The panel is an extension page with the `tabs` API and the same `MessageBus`; it can `tabs.query({ active: true, currentWindow: true })` and `sendToTab()` itself, with the fallback moved into a shared core function. That removes one message type, one handler and a hop. *Medium risk:* verify `currentWindow` in Chrome's side panel and Firefox's sidebar (both resolve to the window the panel is in) before relying on it.
6. **One `sites/` module instead of four.** `AuctionSite`, `SiteRegistry`, `UrlParam` and `url-matcher` together describe "origin + path globs + selectors + where the IDs are". With item 3 they collapse into the config, a `defineSite()` helper and a handful of matching functions; `url-matcher`'s glob escaping is duplicated in `UrlParam` and `CurrencyDetector` and can be shared.
7. **Less prose per line of code.** JSDoc is required on every export and many fields have `@param values.x` blocks that repeat the type. Keep the *why* comments (idempotency, wrapper rule, service-worker listener timing, rate direction); drop descriptions that restate names. Archive the finished dev docs (`architecture-review.md`, `wxt-migration-plan.md`) under `docs/dev/archive/` so a newcomer's reading list is `README.md`, `docs/architecture.md`, `CLAUDE.md`.

**Leave alone** (looks complex, is essential): price parsing and its ambiguity rule, the wrapper/own-output rules in `PriceAnnotator`/`AnnotationView`, the content script's teardown in `stop()`, the one-write `save()` of settings + rates, the background's alarm handling, the typed message `Protocol` on our own `MessageBus`.

---

## 5. Suggested order

| Step | What                                                                         | Risk                                 | Verify                                                    |
| ---: | ---------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------- |
|    1 | Decide on item 4.1; delete the migration if possible                         | none / data loss for unknown installs | `npm test`                                                |
|    2 | Items 4.2, 4.3, 4.4, 4.6 (core and controllers, one commit per item)         | low                                  | `npm test`, dev build in Firefox                          |
|    3 | Tests to Vitest (`WxtVitest`, `fakeBrowser`), optionally to `.test.ts`       | low (tests only)                     | same number of passing cases before and after             |
|    4 | Panel in Preact + JSX, `PanelController` cases ported to Testing Library     | medium (UI behaviour)                | `npm test`, panel checks in both browsers                 |
|    5 | Item 4.5 (panel queries the active tab itself)                               | medium                               | both browsers, panel opened before/after the tab loads    |
|    6 | Item 4.7, update `CLAUDE.md` and `docs/architecture.md`                       | none                                 | —                                                         |

Steps 1–3 already make the code base noticeably smaller without any new runtime dependency; step 4 is then a contained change to one directory.
