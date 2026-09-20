/** Message types exchanged between background, content script and panel. */
export const MSG = Object.freeze({
  /** panel/background -> content script: re-evaluate the page now */
  SYNC_REQUEST: "sync-request",
  /** content script -> background/panel: current state of a tab */
  STATE_CHANGED: "state-changed",
  /** panel -> background: what is the active tab doing right now? */
  GET_ACTIVE_STATE: "get-active-state",
});
