import assert from "node:assert/strict";
import test from "node:test";

import { MessageBus } from "../src/browser/MessageBus.js";

/**
 * The parts of the extension API MessageBus uses, recording its listeners.
 * @param {{sendMessage?: Function, tabsSendMessage?: Function}} [overrides]
 */
function fakeExt({ sendMessage, tabsSendMessage } = {}) {
  const ext = {
    listeners: [],
    runtime: {
      onMessage: { addListener: (listener) => ext.listeners.push(listener) },
      sendMessage: sendMessage ?? (async () => undefined),
    },
    tabs: { sendMessage: tabsSendMessage ?? (async () => undefined) },
  };
  return ext;
}

/** Deliver `message` like the browser does; resolves with what the listener answered. */
function deliver(ext, message, sender = {}) {
  let answered;
  const response = new Promise((resolve) => (answered = resolve));
  const keepOpen = ext.listeners[0](message, sender, answered);
  return { keepOpen, response };
}

test("answers asynchronously and keeps the channel open for it", async () => {
  const ext = fakeExt();
  new MessageBus(ext).on("ping", async (message) => `pong ${message.n}`);
  const { keepOpen, response } = deliver(ext, { type: "ping", n: 1 });
  assert.equal(keepOpen, true);
  assert.equal(await response, "pong 1");
});

test("answers synchronously without keeping the channel open", async () => {
  const ext = fakeExt();
  new MessageBus(ext).on("ping", () => "pong");
  const { keepOpen, response } = deliver(ext, { type: "ping" });
  assert.equal(keepOpen, false);
  assert.equal(await response, "pong");
});

test("does not answer when the handler returns nothing", () => {
  const ext = fakeExt();
  let seen;
  new MessageBus(ext).on("note", (message, sender) => {
    seen = [message.type, sender.tab.id];
  });
  let answered = false;
  const keepOpen = ext.listeners[0]({ type: "note" }, { tab: { id: 3 } }, () => (answered = true));
  assert.equal(keepOpen, false);
  assert.equal(answered, false);
  assert.deepEqual(seen, ["note", 3]);
});

test("ignores messages without a handler", () => {
  const ext = fakeExt();
  new MessageBus(ext).on("ping", () => "pong");
  assert.equal(
    ext.listeners[0]({ type: "other" }, {}, () => {}),
    false,
  );
  assert.equal(
    ext.listeners[0](undefined, {}, () => {}),
    false,
  );
});

test("answers undefined when an async handler fails", async (t) => {
  t.mock.method(console, "warn", () => {});
  const ext = fakeExt();
  new MessageBus(ext).on("ping", async () => {
    throw new Error("boom");
  });
  const { keepOpen, response } = deliver(ext, { type: "ping" });
  assert.equal(keepOpen, true);
  assert.equal(await response, undefined);
});

test("sending swallows a missing receiver", async () => {
  const missing = async () => {
    throw new Error("Could not establish connection. Receiving end does not exist.");
  };
  const bus = new MessageBus(fakeExt({ sendMessage: missing, tabsSendMessage: missing }));
  assert.equal(await bus.send({ type: "x" }), undefined);
  assert.equal(await bus.sendToTab(1, { type: "x" }), undefined);
});

test("sending returns the answer", async () => {
  const ext = fakeExt({
    sendMessage: async (message) => `runtime ${message.type}`,
    tabsSendMessage: async (tabId, message) => `tab ${tabId} ${message.type}`,
  });
  const bus = new MessageBus(ext);
  assert.equal(await bus.send({ type: "a" }), "runtime a");
  assert.equal(await bus.sendToTab(7, { type: "b" }), "tab 7 b");
});
