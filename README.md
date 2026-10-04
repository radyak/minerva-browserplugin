# Minerva - Browser assistant for online auctions

*Minerva* is a cross-browser WebExtension to support users in online auctions on platforms such as biddr.com, numisbids.com or l5.com.
It is named after [*Minerva*](https://en.wikipedia.org/wiki/Minerva), the Roman goddess of wisdom, reason, strategy and victory (among other aspects) and should help to make effective prices transparent and achieve a fair bargain.

## What it does

**Phase 1 scope:** while a configured URL is open, the extension reads the plain
text price and its currency out of a configured element, converts it into the
currency selected in the side panel, adds the auction premium and shipping cost
entered there and appends the resulting effective price as a sibling element
right after it - kept up to date when the price or the settings change. The
side panel also shows the current exchange rates. The target URL and
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
* Disclaimer and Bug reporting link
* Persistence
* Clearer distinction of effective price
* URL-based auction detection & persistence in auction scope
* Backend: Auction database
* Tweak "your bid" price, too
* Migration to [WXT](https://wxt.dev) (build, type safety, messaging)
