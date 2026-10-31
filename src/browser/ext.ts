/**
 * The extension API: `browser.*` in Firefox, `chrome.*` in Chrome - both
 * promise based for MV3 APIs, so one alias is enough (WXT's `browser`, no
 * polyfill). Anything that genuinely differs between browsers lives in
 * ./side-panel.js instead. Messaging goes through ./MessageBus.js.
 */
export { browser as ext } from "wxt/browser";
