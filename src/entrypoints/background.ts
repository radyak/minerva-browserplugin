import { defineBackground } from "wxt/utils/define-background";

import { BackgroundController } from "../background/BackgroundController.ts";
import { RatesService } from "../background/RatesService.ts";
import { ext } from "../browser/ext.ts";
import { MessageBus } from "../browser/MessageBus.ts";
import { SettingsStore } from "../browser/SettingsStore.ts";
import { registerPanelOpener } from "../browser/side-panel.ts";

/**
 * Background script / service worker entry point: wires the BackgroundController.
 * Everything runs inside main() - WXT imports this file in Node at build time.
 */
export default defineBackground(() => {
  registerPanelOpener();

  const store = new SettingsStore();

  new BackgroundController({
    ext,
    bus: new MessageBus(ext),
    store,
    rates: new RatesService({ store }),
  }).start();
});
