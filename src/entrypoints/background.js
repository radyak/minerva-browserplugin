import { defineBackground } from "wxt/utils/define-background";

import { BackgroundController } from "../background/BackgroundController.js";
import { RatesService } from "../background/RatesService.js";
import { ext } from "../browser/ext.js";
import { MessageBus } from "../browser/MessageBus.js";
import { SettingsStore } from "../browser/SettingsStore.js";
import { registerPanelOpener } from "../browser/side-panel.js";

/**
 * Background script / service worker entry point: wires the BackgroundController.
 * Everything runs inside main() - WXT imports this file in Node at build time.
 */
export default defineBackground(() => {
  registerPanelOpener();

  const store = new SettingsStore(ext);

  new BackgroundController({
    ext,
    bus: new MessageBus(ext),
    store,
    rates: new RatesService({ store }),
  }).start();
});
