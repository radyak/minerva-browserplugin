import { defineContentScript } from "wxt/utils/define-content-script";

import { ext } from "../browser/ext.ts";
import { MessageBus } from "../browser/MessageBus.ts";
import { SettingsStore } from "../browser/SettingsStore.ts";
import { ContentController } from "../content/ContentController.ts";
import { SITES } from "../core/sites/sites.config.ts";
// Listed under content_scripts[].css in the manifest (cssInjectionMode "manifest").
import "../content/content.css";

/**
 * Content script entry point: wires the ContentController to the page and the
 * extension API, and tears it down when WXT invalidates the context (extension
 * reloaded, updated or removed; a newer copy of this script started in the tab).
 * The options are read at build time, so `matches` comes straight from the
 * site config.
 */
export default defineContentScript({
  matches: SITES.matchPatterns(),
  runAt: "document_idle",
  main(ctx) {
    const controller = new ContentController({
      window,
      bus: new MessageBus(ext),
      store: new SettingsStore(),
      isValid: () => ctx.isValid,
    });
    ctx.onInvalidated(() => controller.stop());
    controller.start();
  },
});
