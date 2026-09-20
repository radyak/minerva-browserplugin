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
 * Must be valid WebExtension match patterns.
 */
export const CONTENT_SCRIPT_MATCHES = ["https://www.biddr.com/*"];

/**
 * Fine grained URL glob. The content script only marks the element while the
 * page URL matches this pattern. "*" matches any run of characters.
 */
export const TARGET_URL_PATTERN = "https://www.biddr.com/*";

/** CSS selector of the element that gets the red marker. */
export const TARGET_SELECTOR = '.current-bid';

/** Class the content script adds to matched elements (see content/content.css). */
export const MARKER_CLASS = "xbp-marked";

/** Key used for the side panel draft text in browser.storage.local. */
export const STORAGE_KEY_PANEL_INPUT = "panel.inputValue";
