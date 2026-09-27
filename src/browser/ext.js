/**
 * Thin normalisation layer over the extension API.
 *
 * Firefox exposes `browser.*` with promises, Chrome exposes `chrome.*` - which
 * also returns promises for MV3 APIs when no callback is passed. That makes a
 * single alias enough; anything that genuinely differs between browsers lives
 * in ./side-panel.js instead. Messaging goes through ./MessageBus.js.
 */
export const ext = globalThis.browser ?? globalThis.chrome;

/** Build time constant injected by scripts/build.mjs ("chrome" | "firefox"). */
export const TARGET = __TARGET__;

/** @returns {Promise<{id: number, url?: string} | undefined>} the active tab of the current window */
export async function getActiveTab() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** @returns {Promise<Record<string, unknown>>} the stored values of `keys` */
export async function storageGetMany(keys) {
  return (await ext.storage.local.get(keys)) ?? {};
}

export async function storageSet(key, value) {
  await ext.storage.local.set({ [key]: value });
}
