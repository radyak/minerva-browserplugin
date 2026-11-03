import type { ExchangeRatesJSON } from "./rates/ExchangeRates.ts";
import type { AuctionKey } from "./settings/AuctionKey.ts";
import type { BuyerCostsJSON } from "./settings/BuyerCosts.ts";
import type { SettingsJSON } from "./settings/Settings.ts";
import type { TabState } from "./state/TabState.ts";

/** Message types exchanged between background, content script and panel. */
export const MSG = Object.freeze({
  /** background/panel -> content script: re-evaluate the page now */
  SYNC_REQUEST: "sync-request",
  /** content script -> background/panel: current state of a tab */
  STATE_CHANGED: "state-changed",
  /** panel -> background: the current exchange rates of `base` */
  GET_RATES: "get-rates",
  /** panel -> content script: the form's unsaved values, for the price pop-up */
  PREVIEW: "preview",
} as const);

export type MessageType = (typeof MSG)[keyof typeof MSG];

/** A tab's state as sent in messages, with the tab's URL. */
export type TabStateMessage = TabState & { url: string };

/**
 * Values entered in the panel but not saved, for the auction of `key`, with
 * the rates into their currency (null while unknown).
 */
export type Preview = {
  key: AuctionKey;
  settings: SettingsJSON;
  buyer: BuyerCostsJSON;
  rates: ExchangeRatesJSON | null;
};

/**
 * The protocol: per message type, what the message carries besides `type` and
 * what its handler answers (`void`: no answer). Messages are structured-cloned,
 * so they hold plain data only; receivers still validate what arrives
 * (`TabState.from()`, `Currency.of()`), the types only keep senders and
 * handlers in step.
 */
export interface Protocol {
  [MSG.SYNC_REQUEST]: { payload: object; answer: TabStateMessage };
  [MSG.STATE_CHANGED]: { payload: TabStateMessage & { reason: string }; answer: void };
  [MSG.GET_RATES]: {
    payload: { base: string };
    answer: { rates: ExchangeRatesJSON } | { error: string };
  };
  /** null: nothing unsaved (any more), the saved values apply */
  [MSG.PREVIEW]: { payload: { preview: Preview | null }; answer: void };
}

/** A message of type `T` as it is sent. */
export type Message<T extends MessageType = MessageType> = { type: T } & Protocol[T]["payload"];

/** What the handler of `T` answers. */
export type Answer<T extends MessageType> = Protocol[T]["answer"];
