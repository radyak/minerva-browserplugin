import { ext } from "../browser/ext.js";
import { MessageBus } from "../browser/MessageBus.js";
import { SettingsStore } from "../browser/SettingsStore.js";
import { registerPanelOpener } from "../browser/side-panel.js";
import { BackgroundController } from "./BackgroundController.js";
import { RatesService } from "./RatesService.js";

/** Background script / service worker entry point: wires the BackgroundController. */

registerPanelOpener();

const store = new SettingsStore(ext);

new BackgroundController({
  ext,
  bus: new MessageBus(ext),
  store,
  rates: new RatesService({ store }),
}).start();
