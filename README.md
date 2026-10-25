# Minerva - Browser assistant for online auctions

*Minerva* is a cross-browser WebExtension to support users in online auctions on platforms such as biddr.com, numisbids.com or l5.com.
It is named after [*Minerva*](https://en.wikipedia.org/wiki/Minerva), the Roman goddess of wisdom, reason, strategy and victory (among other aspects) and should help to make effective prices transparent and achieve a fair bargain.

## What it does

**Phase 1 scope:** while a configured URL is open, the extension reads the plain
text price and its currency out of a configured element, converts it into the
currency selected in the side panel, adds the auction premium and shipping cost
entered there and appends the resulting effective price as a sibling element
right after it - kept up to date when the price or the settings change. The
side panel also shows the exchange rate the current page needs. The target URL and
the selector are configurable in one file - see [Configuration](docs/configuration.md).

It is a cross-browser Manifest V3 WebExtension (Chrome and Firefox) with a shared core and per-browser packaging.

## Quick start

```bash
npm install
npm run build            # -> dist/chrome, dist/firefox
npm test                 # lint + typecheck + tests
```

Load `dist/chrome` via *Load unpacked* in `chrome://extensions`, or `dist/firefox/manifest.json` via `about:debugging` in Firefox - details in [Development](docs/development.md#install-the-development-build).

## Documentation

| Chapter | Contents |
| --- | --- |
| [How it works](docs/how-it-works.md) | What happens on the page and in the panel, currency detection, price formats |
| [Architecture](docs/architecture.md) | Contexts, layers, components, HTML components, messages, storage, event lifecycles |
| [Configuration](docs/configuration.md) | Auction sites (`sites.config.js`) and plugin-wide constants |
| [Development](docs/development.md) | Build, test, packaging, installing the development build |
| [Architecture review](docs/dev/architecture-review.md) | Review of 2026-09-27 and the refactoring plan it started |

## Plans & Next Steps
* Persistence
* URL-based auction detection & persistence in auction scope
* Backend: Auction database
* Tweak "your bid" price, too
* Migration to [WXT](https://wxt.dev) (build, type safety, messaging)

### Further factors of the effective price

Besides auction premium and shipment, the effective price of a lot depends on
more conditions. Collected from biddr's terms (which defer to each auction house's
conditions) and the conditions of e.g. Künker, Sincona, CNG and Heritage:

**Fix first: shipment is counted per lot.** The shipment is added to every price,
but houses charge it once per invoice (at cost, at the buyer's risk). Either divide
it by an "expected lots won" count (default 1) or show it as a separate
"+ shipping" part instead of folding it into each lot.

**Per auction** (fits the auction > house > site settings):

| Factor | Typical values | Why it matters |
| --- | --- | --- |
| VAT on the premium | Margin scheme: premium incl. VAT (Künker 25 %, Sincona 23 % incl. 8.1 %); regular taxation: 20 % + VAT | the same "20 %" is 20 % or 23.8 % |
| VAT on the hammer price | Regularly taxed lots and, since 2025, lots imported into the EU: VAT on hammer + premium; Swiss houses: 8.1 % on everything but investment gold | up to +19-20 % on the whole price |
| Buyer's residence | Künker: 20 % without VAT outside the EU, refunded against proof of export | already possible via a different premium |
| Online/live bidding surcharge | CNG 21 % live internet vs. 19 % on its own site; UK houses +3.5-6 % + VAT | often taxed differently from the premium |
| Minimum premium per lot | Heritage: 20 %, min. $19 | only relevant for cheap lots |

**Per buyer** (independent of the auction):

| Factor | Typical values |
| --- | --- |
| Import VAT on the customs value (hammer + premium + shipping + insurance) | DE 7 % for collector coins (precious metal coins only above 250 % of the metal value, BMF 2024-12-02); UK reportedly 5 % for heading 9705 (unverified, carriers charge 20 %); US no VAT, but state sales tax |
| Customs duty | 0 % for coins (heading 9705) in EU and UK - skip |
| Customs clearance fee | flat, charged by post/courier in the buyer's currency |
| Exchange rate markup | we convert at the mid-market rate (Frankfurter), banks/cards add about 1-3 % |
| Payment surcharge | card fees up to 4 % (Swiss houses) |
| Bank transfer fee | flat per invoice (e.g. SWIFT) |

Not modelled on purpose: late payment interest, export licences, resale right
(not for coins).

**Suggested order:** (1) VAT rate plus what it applies to (none / premium /
hammer + premium), per auction; (2) exchange rate markup; (3) import VAT plus
clearance fee; (4) payment surcharge; (5) the shipment-per-lot fix. The online
surcharge can go into the premium for now; minimum premium and bank fees can wait.

```
fees    = hammer × premium%
vat     = vat% × (fees | hammer + fees | 0)
lot     = hammer + fees + vat + shipment / lotsWon                (auction currency)
landed  = convert(lot × (1 + importVat%), currency) × (1 + fxMarkup%) × (1 + payment%)
        + clearanceFee                                            (buyer's currency)
```

Implementation notes:

* The per-buyer factors belong into a separate, global buyer settings group (new
  storage key in `SettingsStore`), not into `SettingsBook` - otherwise they would
  have to be entered for every auction.
* The clearance fee is the first amount in the output currency rather than the
  auction's; the panel has to label it accordingly.
* Everything else stays inside `EffectivePriceCalculator` and `Settings.RANGES`;
  the message flow does not change.
* VAT status varying per lot within one auction (UK catalogues mark VAT and import
  lots with `*` / `**`) needs site-specific lot parsing - a later step.
* Most figures come from individual houses' terms and forum posts, not from
  official tax sources; check the UK import VAT against HMRC before relying on it.
