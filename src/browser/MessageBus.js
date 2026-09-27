/**
 * Runtime messaging between background, content script and panel.
 *
 * `on()` owns the one rule that is easy to get wrong with `runtime.onMessage`:
 * an asynchronous answer needs the listener to return `true`, otherwise the
 * channel closes before `sendResponse` is called. Handlers here simply return
 * their answer (or a promise of it); returning `undefined` means "no answer".
 */
export class MessageBus {
  /** @type {Map<string, (message: any, sender: any) => unknown>} */
  #handlers = new Map();

  /** @param {any} ext the extension API (`browser` / `chrome`), injectable for tests */
  constructor(ext) {
    this.ext = ext;
    ext.runtime.onMessage.addListener(this.#dispatch);
  }

  /**
   * Handle every message of `type`; one handler per type.
   * @param {string} type
   * @param {(message: any, sender: any) => unknown} handler returns the answer, a
   *   promise of it, or `undefined` for none
   * @returns {this}
   */
  on(type, handler) {
    this.#handlers.set(type, handler);
    return this;
  }

  /**
   * Send a runtime message (to background and panel) without caring about a
   * missing receiver - panel closed, background not listening yet.
   * @param {object} message
   * @returns {Promise<any>} the answer, undefined when there is none
   */
  async send(message) {
    try {
      return await this.ext.runtime.sendMessage(message);
    } catch {
      return undefined;
    }
  }

  /**
   * Send a message to the content script of one tab, ignoring tabs without one.
   * @param {number} tabId
   * @param {object} message
   * @returns {Promise<any>} the answer, undefined when there is none
   */
  async sendToTab(tabId, message) {
    try {
      return await this.ext.tabs.sendMessage(tabId, message);
    } catch {
      return undefined;
    }
  }

  #dispatch = (message, sender, sendResponse) => {
    const handler = this.#handlers.get(message?.type);
    if (!handler) return false;
    const answer = /** @type {any} */ (handler(message, sender));
    if (typeof answer?.then !== "function") {
      if (answer !== undefined) sendResponse(answer);
      return false;
    }
    answer.then(sendResponse, (error) => {
      console.warn(`[minerva] handling "${message.type}" failed:`, error);
      sendResponse(undefined);
    });
    return true; // keep the message channel open for the async response
  };
}
