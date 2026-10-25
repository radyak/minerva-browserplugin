import { defineContentScript } from "wxt/utils/define-content-script";

import { ext } from "../browser/ext.js";
import { MessageBus } from "../browser/MessageBus.js";
import { SettingsStore } from "../browser/SettingsStore.js";
import { ContentController } from "../content/ContentController.js";
import { SITES } from "../core/sites/sites.config.js";
// Listed under content_scripts[].css in the manifest (cssInjectionMode "manifest").
import "../content/content.css";

/**
 * Content script entry point: wires the ContentController to the page and the
 * extension API. The options are read at build time, so `matches` comes
 * straight from the site config.
 */
export default defineContentScript({
  matches: SITES.matchPatterns(),
  runAt: "document_idle",
  main() {
    new ContentController({
      window,
      bus: new MessageBus(ext),
      store: new SettingsStore(ext),
    }).start();
  },
});
