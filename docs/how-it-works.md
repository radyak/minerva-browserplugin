# How it works

What the extension does on a page and in the panel, from the user's point of view. The components and events behind it are described in [Architecture](architecture.md).

- The content script asks `PriceAnnotator` (`src/core/annotation/`) to reconcile the page whenever
  it loads, the DOM changes (`MutationObserver` on `childList` **and**
  `characterData`, so late-rendered elements and in-place price edits are both
  caught), the page navigates in place (`popstate`, `hashchange`), the settings
  change, or the background script reports a URL change.
- For every match, the element's text is parsed by `src/core/price.ts`, the
  effective price is calculated by the site's calculator - by default
  `effectivePrice` in `src/core/pricing/` (see [The effective price](#the-effective-price)
  below), and the result is inserted as a sibling right after the price element (same tag, class `minerva-effective-price`, `aria-live="polite"`). The
  price element itself is never modified. Re-running is idempotent: the
  annotation is only written when its text actually changes, so the extension's
  own DOM writes cannot drive the observer in circles.
- The input currency is read from the price text: `EUR`/`USD`/`GBP`/`CHF` as a
  standalone code, or `€`, `$`, `US$`, `£`, `Fr.`, `SFr.`; the one closest to
  the number wins (prefix before suffix).
- When the text holds no parsable price (`sold out`, an empty element, a value
  the page has not filled in yet), or its currency is missing, unsupported or
  has no exchange rate (`500`, `¥500`, foreign prices before any rates were
  saved), the sibling is still inserted and shows
  `UNPARSABLE_TEXT` (`n/a`), flagged with `data-minerva-unparsable` and greyed out by
  `content.css`. It turns back into a real amount as soon as the text becomes a
  price again, and vice versa. Annotations are only dropped when the URL stops
  matching or their element is no longer a price element of the site.
- Prices are given back in the notation they came in - currency position,
  decimal and grouping separators and surrounding text are preserved; only the
  currency is swapped (a symbol for a symbol, a code for a code):

  | in | out (EUR, 1 USD = 0.5 EUR, +100 shipment in the price's currency) |
  | --- | --- |
  | `500 EUR` | `600 EUR` |
  | `USD 1.359` | `EUR 729,50` |
  | `$49.99` | `€75.00` |
  | `1.234,56 EUR` | `1.334,56 EUR` |
  | `1'200 EUR (20)` | `1'300 EUR` (bracketed asides are dropped) |
  | `500` | `n/a` (no currency) |

  A single separator followed by exactly three digits is read as grouping
  (`1.359` = 1359), anything else as a decimal separator (`1.35` = 1.35).
  Bracketed asides - a bid count, an estimate, a conversion - are never the
  price: they are skipped when looking for the number and left out of the
  output, unless the whole text is one.
- The background script watches `tabs.onUpdated` (covers SPA `pushState`
  navigation), sets an `ON` badge on the toolbar icon while a tab is on a
  configured site and asks that tab to sync.
- The panel is one page (React) used by both browsers - Chrome shows it via
  `chrome.sidePanel`, Firefox via `sidebar_action`. It asks the active tab
  directly what it is doing; a tab without the content script (not loaded yet)
  is judged by its URL. Settings are saved per
  auction: *Save* stores them under the active tab's site, auction house and
  auction ID, together with the exchange rates of their currency, in one write to
  `storage.local` (`auctionSettings`, `exchangeRates`; the *Your costs* section,
  which applies to every auction, goes to `buyerCosts` in the same write), and makes the active tab
  recalculate right away; other open tabs follow via `storage.onChanged`. An
  emptied input keeps the value shown.
- Whenever the active tab is on another auction (navigation, tab switch), the
  panel fills the form with the settings that apply there: those saved for the
  same auction on the same site, otherwise the latest saved for the same auction
  house, otherwise the latest saved on the site, otherwise the defaults. Below
  the auction IDs at the top, *Values from* highlights where the values come
  from: *Auction*, *House*, *Site* or *Defaults*. The page calculates with the
  same settings (see [Configuration](configuration.md#which-saved-settings-apply)). Each input's hint is hidden until the `?`
  icon next to its label is clicked (a second click hides it again).
- The shipment is entered in the auction's currency: next to it the panel shows
  the currency of the active tab's prices ("–" while none was found, all of them
  when the page mixes several), and it is converted together with the price.
- The form has two sections. *This auction* (saved per auction, as above):
  currency, auction premium, shipment, lots won and - behind the switch *VAT on
  the hammer price* - the hammer price VAT. *Your costs · all auctions* (saved
  once, the same everywhere): behind the switch *Add import and payment costs*,
  import VAT, payment costs and flat fees. Switching the section off keeps its
  values for later; a switched off hammer VAT is saved as none. Invalid values
  (outside the ranges, a fraction of a lot, a switched on hammer VAT without a
  rate) are marked and nothing is saved.
- *How a price adds up*, below the form, opens an example: a hammer price of
  1,000 in the page's currency, part by part, with the values in the form - saved
  or not. Parts that are 0 are left out.
- Selecting a currency (EUR, USD, GBP, CHF; default EUR) immediately loads the
  rates against the other three from the Frankfurter API (through the background script) and saves them with the
  settings. The *Plugin status* card only shows the rates the active tab needs:
  from the currencies of its prices into the selected one (e.g. `1 USD = 0.8333 GBP`).
  The background refreshes the saved rates of every currency in use (and of the
  default currency) on install/update, on browser start and once a day. Until
  rates for a currency have been stored once, only prices already in that
  currency are converted; all others show `n/a`.
- The settings form is only shown while the active tab is on an actual auction:
  on a configured site, with the auction house or auction ID found in the page
  URL (per site, see [Configuration](configuration.md)). The IDs are shown at the
  top of the panel, above the form ("unknown" for one not found). Otherwise the
  panel shows Minerva with a `?` speech bubble and "No auction or site active"
  (no site) or "No auction detected on this page" (site, but no IDs) instead; prices
  are still converted and the *Plugin status* card stays visible either way.
- Below the *Plugin status* card the panel shows a disclaimer (bidding aid only, no
  responsibility for the prices shown), links for bug reports and feature
  requests (email, GitHub repository) and, at the very bottom, the build version
  (e.g. `v1.2.3+abc1234`; `v0.0.0-dev` for local builds, see
  [Development](development.md#build-and-test)).

## The effective price

What a lot effectively costs, as `effectivePrice` (`src/core/pricing/PriceCalculator.ts`)
works it out:

```
lot    = hammer × (1 + premium% + hammerVat%) + shipment / lotsWon       (auction's currency)
total  = convert(lot) × (1 + payment% + importVat%) + flatFees / lotsWon (your currency)
```

The panel keeps the number of inputs small by asking for factors that work the
same way to be added up into one:

| Input | Saved | Add up into it |
| --- | --- | --- |
| Auction premium (%) | per auction | the buyer's premium *including its VAT* (20 % + 19 % VAT = 23.8 %), online or live bidding surcharges (CNG: 21 % live instead of 19 %); a different premium for buyers outside the EU is just another value |
| Shipment, in the auction's currency | per auction | shipping and insurance per invoice |
| Lots won | per auction | how many lots you expect to win; shipment and flat fees are split over them, as they are charged once per invoice |
| Hammer price VAT (%), behind a switch | per auction | VAT on the hammer price for regularly taxed lots or lots the house imported; only on the hammer price, as the premium already carries its VAT |
| Import VAT (%) | all auctions | VAT your customs charge on lots shipped in (e.g. 7 % for collector coins in Germany) |
| Payment costs (%) | all auctions | your bank's or card's exchange rate markup (we convert at the ECB mid rate) plus any card or payment surcharge |
| Flat fees, in your currency | all auctions | customs clearance by post or courier, bank transfer fees |

Payment costs and import VAT are both charged on the converted lot, but
separately, so they are added rather than multiplied. Not modelled: minimum
premiums per lot, VAT status varying per lot within one auction, late payment
interest.
