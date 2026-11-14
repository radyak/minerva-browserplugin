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
  below), and the result is inserted as a sibling right after the price element (same tag - a `span` for buttons and links - class `minerva-effective-price`, `aria-live="polite"`; centred or right-aligned below a full-width price whose text is aligned that way). The
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
  `storage.local` (`auctionSettings`, `exchangeRates`), and makes the active tab
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
- The form holds every cost factor, all saved per auction (as above): currency,
  auction premium, shipment, lots won and payment costs, then behind the switch
  *Advanced settings* the hammer price VAT, import VAT and flat fees - payment
  costs differ between sites and houses, import VAT with the country an auction
  ships from. The switch starts on when one of the advanced values of the shown
  settings is not 0, off otherwise; while it is off, they count (and are saved)
  as 0. Invalid values (outside the ranges, a fraction of a lot) are marked and
  nothing is saved.
- Clicking a Minerva bubble on the page (Minerva or the speech bubble; Enter or
  Space when it has the focus) opens *How this price adds up* next to it: that
  lot's hammer price, part by part, up to the effective price, written like the
  page writes its prices. Parts that are 0 are left out. The pop-up floats above
  the page with a drop shadow and moves nothing; there is only ever one - clicking
  another bubble moves it there, clicking its own bubble again, its `×` or Escape
  closes it. It follows the form as you type: while the panel holds unsaved
  values for this auction it calculates with them (and says so), otherwise with
  the saved ones; the bubbles on the page keep showing the saved values until
  *Save*. A site with a calculator of its own only shows the hammer and the
  effective price.
- Selecting a currency (EUR, USD, GBP, CHF; default EUR) immediately loads the
  rates against the other three from the Frankfurter API (through the background script) and saves them with the
  settings. Under the currency select the panel shows only the rates the active tab needs:
  from the currencies of its prices into the selected one (e.g. `1 USD = 0.8333 GBP`).
  The background refreshes the saved rates of every currency in use (and of the
  default currency) on install/update, on browser start and once a day. Until
  rates for a currency have been stored once, only prices already in that
  currency are converted; all others show `n/a`.
- The settings form is shown while the active tab is on a configured site. The
  auction house and auction IDs found in the page URL (per site, see
  [Configuration](configuration.md)) are shown at the top of the panel, above the
  form ("unknown" for one not found); they are optional - without them the
  settings saved for the house or the site apply. Off a site the panel shows
  Minerva with a `?` speech bubble and "No auction or site active" instead.
- At the bottom the panel shows a disclaimer (bidding aid only, no
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
| Hammer price VAT (%), under *Advanced settings* | per auction | VAT on the hammer price for regularly taxed lots or lots the house imported; only on the hammer price, as the premium already carries its VAT |
| Import VAT (%), under *Advanced settings* | per auction | VAT your customs charge on lots shipped in (e.g. 7 % for collector coins in Germany) |
| Payment costs (%) | per auction | your bank's or card's exchange rate markup (we convert at the ECB mid rate) plus any card or payment surcharge |
| Flat fees, in your currency, under *Advanced settings* | per auction | customs clearance by post or courier, bank transfer fees |

Payment costs and import VAT are both charged on the converted lot, but
separately, so they are added rather than multiplied. Not modelled: minimum
premiums per lot, VAT status varying per lot within one auction, late payment
interest.
