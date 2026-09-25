/**
 * Thin normalisation layer over the extension API.
 *
 * Firefox exposes `browser.*` with promises, Chrome exposes `chrome.*` - which
 * also returns promises for MV3 APIs when no callback is passed. That makes a
 * single alias enough; anything that genuinely differs between browsers lives
 * in ./panel.js instead.
 */
export const ext = globalThis.browser ?? globalThis.chrome;

/** Build time constant injected by scripts/build.mjs ("chrome" | "firefox"). */
export const TARGET = __TARGET__;

/** Send a runtime message without caring about a missing receiver. */
export async function sendMessage(message) {
  try {
    return await ext.runtime.sendMessage(message);
  } catch {
    // No listener (panel closed, content script not injected yet) - not an error.
    return undefined;
  }
}

/** Send a message to a single tab, ignoring tabs without a content script. */
export async function sendMessageToTab(tabId, message) {
  try {
    return await ext.tabs.sendMessage(tabId, message);
  } catch {
    return undefined;
  }
}

/** @returns {Promise<object | undefined>} the active tab of the current window */
export async function getActiveTab() {
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  return tab;
}

export async function storageGet(key, fallback = undefined) {
  const result = await ext.storage.local.get(key);
  return result?.[key] ?? fallback;
}

/** @returns {Promise<Record<string, unknown>>} the stored values of `keys` */
export async function storageGetMany(keys) {
  return (await ext.storage.local.get(keys)) ?? {};
}

export async function storageSet(key, value) {
  await ext.storage.local.set({ [key]: value });
}
