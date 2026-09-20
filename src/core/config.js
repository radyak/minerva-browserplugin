/**
 * Single source of truth for everything the extension is supposed to act on.
 *
 * The values below are PLACEHOLDERS for phase 1 - replace them with the real
 * target once it is known. Both the manifests (build time) and the runtime code
 * read from here, so a change only has to happen in this file.
 */

/**
 * Coarse host level match patterns. They decide where the content script is
 * injected at all and are baked into every manifest by scripts/build.mjs.
 * Must be valid WebExtension match patterns (no port numbers allowed).
 */
export const CONTENT_SCRIPT_MATCHES = ["https://www.biddr.com/*","https://example.com/*"];

/**
 * Fine grained URL glob. The content script only acts while the page URL
 * matches this pattern. "*" matches any run of characters.
 */
export const TARGET_URL_PATTERN = "https://www.biddr.com/*"; //"https://example.com/app/dashboard*";

/** CSS selector of the element whose text content holds the price. */
export const TARGET_SELECTOR = '.current-bid, #app-root .content-card[data-module="overview"]';

/** Surcharge applied to the parsed price (0.2 = +20%). */
export const MARKUP_RATE = 0.2;

/** Class of the sibling element the extension inserts (see content/content.css). */
export const ANNOTATION_CLASS = "xbp-price-markup";

/** Shown in the sibling element when the target text holds no parsable price. */
export const UNPARSABLE_TEXT = "n/a";

/** Key used for the side panel draft text in browser.storage.local. */
export const STORAGE_KEY_PANEL_INPUT = "panel.inputValue";
