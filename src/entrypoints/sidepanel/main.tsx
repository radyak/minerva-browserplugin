import "bootstrap/dist/css/bootstrap.min.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { ext } from "../../browser/ext.ts";
import { MessageBus } from "../../browser/MessageBus.ts";
import { SettingsStore } from "../../browser/SettingsStore.ts";
import { Panel } from "../../panel/Panel.tsx";
import "../../panel/panel.css";

/** Side panel entry point: renders the Panel with the extension API. */

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Panel tabs={ext.tabs} bus={new MessageBus(ext)} store={new SettingsStore()} />
  </StrictMode>,
);
