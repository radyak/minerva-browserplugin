import { ext } from "../browser/ext.js";
import { MessageBus } from "../browser/MessageBus.js";
import { SettingsStore } from "../browser/SettingsStore.js";
import { PanelController } from "./PanelController.js";

/** Side panel entry point: wires the PanelController to panel.html and the extension API. */

new PanelController({
  document,
  tabs: ext.tabs,
  bus: new MessageBus(ext),
  store: new SettingsStore(ext),
}).start();
