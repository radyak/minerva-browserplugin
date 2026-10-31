import type { Browser, WxtBrowser } from "wxt/browser";

import type { Answer, Message, MessageType } from "../core/messages.ts";

/** The parts of the extension API messaging needs. */
export type MessagingApi = {
  runtime: Pick<WxtBrowser["runtime"], "onMessage" | "sendMessage">;
  tabs: Pick<WxtBrowser["tabs"], "sendMessage">;
};

/**
 * Handles the messages of type `T`: returns the answer, a promise of it, or
 * `undefined` for none (the only choice for a message without an answer).
 */
export type Handler<T extends MessageType> = (
  message: Message<T>,
  sender: Browser.runtime.MessageSender,
) => Answer<T> | Promise<Answer<T>>;

/**
 * Runtime messaging between background, content script and panel.
 *
 * `on()` owns the one rule that is easy to get wrong with `runtime.onMessage`:
 * an asynchronous answer needs the listener to return `true`, otherwise the
 * channel closes before `sendResponse` is called. Handlers here simply return
 * their answer (or a promise of it); returning `undefined` means "no answer".
 *
 * Message types, payloads and answers are typed by the protocol in
 * src/core/messages.ts; the wire format is the message itself (`{ type, ...payload }`).
 */
export class MessageBus {
  #handlers = new Map<string, Handler<MessageType>>();
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
  on<T extends MessageType>(type: T, handler: Handler<T>): this {
    this.#handlers.set(type, handler as unknown as Handler<MessageType>);
    return this;
  }

  /**
   * Stop handling messages of `type`; they are ignored from now on.
   */
  off(type: MessageType): this {
    this.#handlers.delete(type);
    return this;
  }

  /**
   * Send a runtime message (to background and panel) without caring about a
   * missing receiver - panel closed, background not listening yet.
   * @returns the answer, undefined when there is none
   */
  async send<T extends MessageType>(message: Message<T>): Promise<Answer<T> | undefined> {
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
  async sendToTab<T extends MessageType>(
    tabId: number,
    message: Message<T>,
  ): Promise<Answer<T> | undefined> {
    try {
      return await this.ext.tabs.sendMessage(tabId, message);
    } catch {
      return undefined;
    }
  }

  #dispatch = (
    message: unknown,
    sender: Browser.runtime.MessageSender,
    sendResponse: (answer: unknown) => void,
  ): boolean => {
    const type = (message as { type?: unknown } | null | undefined)?.type;
    const handler = typeof type === "string" ? this.#handlers.get(type) : undefined;
    if (!handler) return false;
    const answer = handler(message as Message, sender);
    if (!isThenable(answer)) {
      if (answer !== undefined) sendResponse(answer);
      return false;
    }
    answer.then(sendResponse, (error: unknown) => {
      console.warn(`[minerva] handling "${String(type)}" failed:`, error);
      sendResponse(undefined);
    });
    return true; // keep the message channel open for the async response
  };
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return typeof (value as PromiseLike<unknown> | undefined)?.then === "function";
}
