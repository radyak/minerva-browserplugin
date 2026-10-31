import type { Browser, WxtBrowser } from "wxt/browser";

/** The parts of the extension API messaging needs. */
export type MessagingApi = {
  runtime: Pick<WxtBrowser["runtime"], "onMessage" | "sendMessage">;
  tabs: Pick<WxtBrowser["tabs"], "sendMessage">;
};

/* eslint-disable @typescript-eslint/no-explicit-any -- messages are untyped until they get a protocol map */
/** A message as it arrives; `type` picks the handler. */
type Message = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Handles one message type: returns the answer, a promise of it, or `undefined` for none. */
type Handler = (message: Message, sender: Browser.runtime.MessageSender) => unknown;

/**
 * Runtime messaging between background, content script and panel.
 *
 * `on()` owns the one rule that is easy to get wrong with `runtime.onMessage`:
 * an asynchronous answer needs the listener to return `true`, otherwise the
 * channel closes before `sendResponse` is called. Handlers here simply return
 * their answer (or a promise of it); returning `undefined` means "no answer".
 */
export class MessageBus {
  #handlers = new Map<string, Handler>();
  readonly ext: MessagingApi;

  /** @param ext the extension API (`browser` / `chrome`), injectable for tests */
  constructor(ext: MessagingApi) {
    this.ext = ext;
    ext.runtime.onMessage.addListener(this.#dispatch);
  }

  /**
   * Handle every message of `type`; one handler per type.
   * @param handler returns the answer, a
   *   promise of it, or `undefined` for none
   */
  on(type: string, handler: Handler): this {
    this.#handlers.set(type, handler);
    return this;
  }

  /**
   * Stop handling messages of `type`; they are ignored from now on.
   */
  off(type: string): this {
    this.#handlers.delete(type);
    return this;
  }

  /**
   * Send a runtime message (to background and panel) without caring about a
   * missing receiver - panel closed, background not listening yet.
   * @returns the answer, undefined when there is none
   */
  async send(message: object): Promise<Message> {
    try {
      return await this.ext.runtime.sendMessage(message);
    } catch {
      return undefined;
    }
  }

  /**
   * Send a message to the content script of one tab, ignoring tabs without one.
   * @returns the answer, undefined when there is none
   */
  async sendToTab(tabId: number, message: object): Promise<Message> {
    try {
      return await this.ext.tabs.sendMessage(tabId, message);
    } catch {
      return undefined;
    }
  }

  #dispatch = (
    message: Message,
    sender: Browser.runtime.MessageSender,
    sendResponse: (answer: unknown) => void,
  ): boolean => {
    const handler = this.#handlers.get(message?.type);
    if (!handler) return false;
    const answer = handler(message, sender);
    if (!isThenable(answer)) {
      if (answer !== undefined) sendResponse(answer);
      return false;
    }
    answer.then(sendResponse, (error: unknown) => {
      console.warn(`[minerva] handling "${message.type}" failed:`, error);
      sendResponse(undefined);
    });
    return true; // keep the message channel open for the async response
  };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | undefined)?.then === "function";
}
