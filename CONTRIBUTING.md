# Contributing to Minerva

Thank you for helping! Minerva is meant to grow in one place: improvements made here reach
every user through the official browser stores, while a fork only reaches its own. So please
bring your changes here rather than publishing a modified copy.

## Ways to help

- **Report a bug or a wrong price** - open an issue on
  [GitHub](https://github.com/radyak/minerva-browserplugin/issues) with the page URL, the price
  shown on the page, what Minerva showed and what you expected.
- **Suggest an auction site** - open an issue with the site's URL and an example page; adding a
  site usually means one entry in `src/core/sites/sites.config.ts`
  (see [Configuration](docs/configuration.md)).
- **Send a pull request** - for anything bigger than a small fix, open an issue first so we can
  agree on the approach before you spend time on it.
- **or just send me a coffee :)** - [PayPal.me](https://paypal.me/radiculousYak)

## Pull requests

- Read [CLAUDE.md](CLAUDE.md) and [Architecture](docs/architecture.md) first: they describe the
  invariants that keep the extension working (e.g. the annotator must stay idempotent).
- Run `npm test` (lint, typecheck, unit tests) and make sure it passes; add a test for what you
  change. For changes to the content or background script, also try a real build in a browser
  (`npm run dev:firefox`) - see [Development](docs/development.md).
- Use conventional-commit subjects (`feat:`, `fix:`, `docs:` ...).

## License of contributions

Minerva is licensed under the [GNU General Public License, version 3 or later](LICENSE). By
submitting a contribution you agree that it is licensed under the same terms and that you have
the right to do so. The name *Minerva* and its icon are not part of that license - see
[License](README.md#license).
