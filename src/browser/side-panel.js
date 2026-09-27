import { ext, TARGET } from "./ext.js";

/**
 * The one place where Chrome and Firefox really diverge: Chrome has
 * `chrome.sidePanel` (manifest key `side_panel`), Firefox has
 * `browser.sidebarAction` (manifest key `sidebar_action`).
 *
 * esbuild strips the branch that does not belong to the current build target.
 */

/**
 * Wire the toolbar button so that clicking it reveals the panel.
 * Call once from the background script.
 */
export function registerPanelOpener() {
  if (TARGET === "chrome") {
    // Chrome can do this natively; no click listener needed afterwards.
    ext.sidePanel
      ?.setPanelBehavior({ openPanelOnActionClick: true })
      .catch((error) => console.warn("[panel] setPanelBehavior failed:", error));
    return;
  }

  // Firefox: sidebarAction.open() must be called from a user gesture,
  // the action click qualifies as one.
  ext.action?.onClicked.addListener(() => {
    ext.sidebarAction?.toggle();
  });
}
