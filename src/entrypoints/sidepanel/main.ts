import "bootstrap/dist/css/bootstrap.min.css";

import { ext } from "../../browser/ext.ts";
import { MessageBus } from "../../browser/MessageBus.ts";
import { SettingsStore } from "../../browser/SettingsStore.ts";
import { PanelController } from "../../panel/PanelController.ts";
import "../../panel/panel.css";

/** Side panel entry point: wires the PanelController to index.html and the extension API. */

new PanelController({
  document,
  tabs: ext.tabs,
  bus: new MessageBus(ext),
  store: new SettingsStore(ext),
}).start();
