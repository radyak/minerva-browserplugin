import { ext } from "../browser/ext.js";
import { MessageBus } from "../browser/MessageBus.js";
import { SettingsStore } from "../browser/SettingsStore.js";
import { ContentController } from "./ContentController.js";
// Bundled to content.css next to content.js (see scripts/build.mjs).
import "./content.css";

/** Content script entry point: wires the ContentController to the page and the extension API. */

new ContentController({
  window,
  bus: new MessageBus(ext),
  store: new SettingsStore(ext),
}).start();
