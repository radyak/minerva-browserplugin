# How it works

What the extension does on a page and in the panel, from the user's point of view. The components and events behind it are described in [Architecture](architecture.md).

- The content script asks `PriceAnnotator` (`src/core/annotation/`) to reconcile the page whenever
  it loads, the DOM changes (`MutationObserver` on `childList` **and**
  `characterData`, so late-rendered elements and in-place price edits are both
  caught) or the background script reports a URL change.
- For every match, the element's text is parsed by `src/core/price.js`, the
  effective price is calculated by the site's calculator - by default
  `EffectivePriceCalculator` in `src/core/pricing/` (price converted into the selected currency,
  plus premium, plus shipment), and the result is inserted as a sibling right
  after the
  price element (same tag, class `minerva-effective-price`, `aria-live="polite"`). The
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
  matching.
- Prices are given back in the notation they came in - currency position,
  decimal and grouping separators and surrounding text are preserved; only the
  currency is swapped (a symbol for a symbol, a code for a code):

  | in | out (EUR, 1 USD = 0.5 EUR, +100 shipment) |
  | --- | --- |
  | `500 EUR` | `600 EUR` |
  | `USD 1.359` | `EUR 779,50` |
  | `$49.99` | `€125.00` |
  | `1.234,56 EUR` | `1.334,56 EUR` |
  | `500` | `n/a` (no currency) |

  A single separator followed by exactly three digits is read as grouping
  (`1.359` = 1359), anything else as a decimal separator (`1.35` = 1.35).
- The background script watches `tabs.onUpdated` (covers SPA `pushState`
  navigation), sets a badge on the toolbar icon and relays sync requests.
- The panel is one HTML file used by both browsers - Chrome shows it via
  `chrome.sidePanel`, Firefox via `sidebar_action`. It shows the saved settings;
  *Save* persists them together with the matching exchange rates in one write to
  `storage.local` (`settings`, `exchangeRates`) and makes the active tab
  recalculate right away; other open tabs follow via `storage.onChanged`. An
  emptied input keeps the saved value. Each input's hint is hidden until the `?`
  icon next to its label is clicked (a second click hides it again).
- Selecting a currency (EUR, USD, GBP, CHF; default EUR) immediately updates the
  shipment's currency hint and loads the rates against the other three from the
  Frankfurter API (through the background script) and saves them with the
  currency. The *Plugin status* card only shows the rates the active tab needs:
  from the currencies of its prices into the selected one (e.g. `1 USD = 0.8333 GBP`).
  The background refreshes the saved rates on install/update, on browser start and
  once a day. Until rates for the
  saved currency have been stored once, only prices already in that currency
  are converted; all others show `n/a`.
- While the extension is inactive in the active tab, the panel hides the settings
  form and shows Minerva with a `?` speech bubble and "No auction or platform
  active" instead; the *Plugin status* card stays visible.
- While active, the *Plugin status* card also shows the auction house and auction
  IDs read from the page URL (per site, see [Configuration](configuration.md)).
- Below the *Plugin status* card the panel shows a disclaimer (bidding aid only, no
  responsibility for the prices shown) and links for bug reports and feature
  requests (email, GitHub repository).
