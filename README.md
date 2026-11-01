# Minerva - Browser assistant for online auctions

*Minerva* is a cross-browser WebExtension to support users in online auctions on sites such as biddr.com, numisbids.com or l5.com.
It is named after [*Minerva*](https://en.wikipedia.org/wiki/Minerva), the Roman goddess of wisdom, reason, strategy and victory (among other aspects) and should help to make effective prices transparent and achieve a fair bargain.

## What it does

While a page of a configured auction site is open, the extension reads the plain
text price and its currency out of the configured elements, adds the auction premium,
shipping cost and VAT entered in the side panel, converts the result into the currency
selected there, adds your own import and payment costs if switched on and appends the effective price as a sibling element right after each
price - kept up to date when the price or the settings change. Settings are saved per
auction (falling back to the auction house's, then the site's). The side panel also
shows what the extension does on the page and the exchange rates it needs. The sites,
their URLs and price selectors are configured in one file - see
[Configuration](docs/configuration.md).

Currently configured: biddr.com and numisbids.com.

It is a cross-browser Manifest V3 WebExtension (Chrome and Firefox), built with [WXT](https://wxt.dev), TypeScript and React (side panel).

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
| [Architecture](docs/architecture.md) | Contexts, layers, a diagram of the files and how they work together, panel components, messages, storage, event lifecycles |
| [Configuration](docs/configuration.md) | Auction sites (`sites.config.ts`) and plugin-wide constants |
| [Development](docs/development.md) | Build, test, packaging, installing the development build |
| [Framework and simplification review](docs/dev/framework-and-simplification-review.md) | Review of 2026-11-01: simplifications, Vitest, the React panel - and what was done |
| [Archive](docs/dev/archive/) | Finished plans: the architecture review of 2026-09-27, the WXT migration |

## Plans & Next Steps
* Backend: Auction database
* Tweak "your bid" price, too
* Minimum premium per lot (e.g. Heritage: 20 %, min. $19)
* VAT status per lot (UK catalogues mark VAT and import lots with `*` / `**`) - needs
  site-specific lot parsing

### Factors of the effective price

Besides auction premium and shipment, the panel now covers VAT on the hammer price,
lots won (shipment and flat fees are charged per invoice and split over them) and,
saved once for all auctions, import VAT, payment costs and flat fees. Related
factors are added up into one input rather than getting their own: the premium is
entered *including* its VAT and online surcharges, payment costs combine the
exchange rate markup and card surcharges, flat fees combine customs clearance and
bank fees. The formula and the inputs are described in
[How it works](docs/how-it-works.md#the-effective-price).

Sources: biddr's terms (which defer to each auction house's conditions) and the
conditions of e.g. Künker, Sincona, CNG and Heritage:

| Factor | Typical values | In the panel |
| --- | --- | --- |
| VAT on the premium | Margin scheme: premium incl. VAT (Künker 25 %, Sincona 23 % incl. 8.1 %); regular taxation: 20 % + VAT | added into the auction premium |
| VAT on the hammer price | Regularly taxed lots and, since 2025, lots imported into the EU; Swiss houses: 8.1 % on everything but investment gold | *VAT on the hammer price* switch |
| Buyer's residence | Künker: 20 % without VAT outside the EU, refunded against proof of export | a different auction premium |
| Online/live bidding surcharge | CNG 21 % live internet vs. 19 % on its own site; UK houses +3.5-6 % + VAT | added into the auction premium |
| Import VAT on the customs value | DE 7 % for collector coins (precious metal coins only above 250 % of the metal value, BMF 2024-12-02); UK reportedly 5 % for heading 9705 (unverified, carriers charge 20 %); US no VAT, but state sales tax | *Import VAT* |
| Customs duty | 0 % for coins (heading 9705) in EU and UK | skipped |
| Exchange rate markup | we convert at the mid-market rate (Frankfurter), banks/cards add about 1-3 % | added into *Payment costs* |
| Payment surcharge | card fees up to 4 % (Swiss houses) | added into *Payment costs* |
| Customs clearance fee, bank transfer fee | flat, per parcel / invoice | added into *Flat fees* |

Not modelled on purpose: late payment interest, export licences, resale right
(not for coins). Most figures come from individual houses' terms and forum posts,
not from official tax sources; check the UK import VAT against HMRC before relying
on it.
