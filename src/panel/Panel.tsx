import { useCallback, useEffect, useRef, useState } from "react";
import type { WxtBrowser } from "wxt/browser";

import type { MessageBus } from "../browser/MessageBus.ts";
import type { SettingsStore } from "../browser/SettingsStore.ts";
import { MSG } from "../core/messages.ts";
import { AuctionKey } from "../core/settings/AuctionKey.ts";
import { Settings } from "../core/settings/Settings.ts";
import type { SettingsScope } from "../core/settings/SettingsScope.ts";
import { SITES } from "../core/sites/sites.config.ts";
import type { AuctionSite } from "../core/sites/sites.ts";
import { TabState } from "../core/state/TabState.ts";
import { AuctionHeader } from "./AuctionHeader.tsx";
import { SettingsForm, type ShownSettings } from "./SettingsForm.tsx";
import { StatusCard } from "./StatusCard.tsx";
import { useRates } from "./useRates.ts";

export type PanelProps = {
  /** the extension `tabs` API */
  tabs: Pick<WxtBrowser["tabs"], "query" | "onActivated" | "onUpdated">;
  bus: Pick<MessageBus, "on" | "off" | "send" | "sendToTab">;
  store: Pick<SettingsStore, "load" | "save">;
  /** to judge a tab without a content script by its URL */
  sites?: readonly AuctionSite[];
  /** the build version, shown at the bottom of the panel */
  version?: string;
};

/** The values in the form and where the settings were found (null: the defaults). */
type Shown = ShownSettings & { scope: SettingsScope | null };

/**
 * Side panel (Chrome) / sidebar (Firefox): shows and saves the settings of the
 * auction in the active tab, what the extension does there and the exchange
 * rates from that tab's price currencies into the selected currency (loaded by
 * the background). Identical on both browsers; everything it touches is passed in.
 */
export function Panel({ tabs, bus, store, sites = SITES, version = "0.0.0-dev" }: PanelProps) {
  /** the active tab; null until known */
  const [tab, setTab] = useState<TabState | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const { rates, ratesFor } = useRates(bus, currency);
  /** the auction whose settings are shown; read by callbacks that outlive a render */
  const key = useRef<AuctionKey | null>(null);

  /**
   * Ask the active tab what it is doing (its content script re-reads the
   * settings first; judged by the URL without one) and show it; when the tab is
   * on another auction than before, fill the form with that auction's settings.
   */
  const refresh = useCallback(async () => {
    const state = await activeTabState(tabs, bus, sites);
    setTab(state);
    const next = AuctionKey.from(state);
    if (AuctionKey.equals(next, key.current)) return;
    key.current = next;
    const { book } = await store.load();
    if (!AuctionKey.equals(next, key.current)) return; // the tab moved on in the meantime
    const found = book.resolve(next);
    const settings = found?.settings ?? Settings.DEFAULT;
    setShown({ settings, scope: found?.scope ?? null });
    setCurrency(settings.currency);
  }, [tabs, bus, store, sites]);

  useEffect(() => {
    // Re-ask instead of trusting the message: it may come from a background tab.
    bus.on(MSG.STATE_CHANGED, () => {
      refresh();
    });
    const onActivated = () => refresh();
    const onUpdated = (_tabId: number, changeInfo: { url?: string; status?: string }) => {
      if (changeInfo.url || changeInfo.status === "complete") refresh();
    };
    tabs.onActivated.addListener(onActivated);
    tabs.onUpdated.addListener(onUpdated);
    // Not a synchronous setState: refresh() sets state only after awaiting the tab's answer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
    return () => {
      bus.off(MSG.STATE_CHANGED);
      tabs.onActivated.removeListener(onActivated);
      tabs.onUpdated.removeListener(onUpdated);
    };
  }, [tabs, bus, refresh]);

  /**
   * Save `settings` for the active tab's auction, with the matching rates; the
   * tab recalculates.
   */
  const save = async (settings: Settings) => {
    const saveKey = key.current;
    if (!saveKey?.site) return;
    // Settings and matching rates in one write: open tabs never see one without the other.
    // Without matching rates the page shows n/a until the background has fetched them.
    await store.save(saveKey, settings, (await ratesFor(settings.currency)) ?? undefined);
    const found = (await store.load()).book.resolve(saveKey);
    setShown({ settings, scope: found?.scope ?? null });
    // Asking the tab for its state makes it re-read the settings and recalculate.
    await refresh();
  };

  const onSite = tab !== null && TabState.onSite(tab);
  return (
    <div className="d-flex flex-column gap-3 p-3 min-vh-100">
      {onSite && shown && (
        <>
          <AuctionHeader tab={tab} scope={shown.scope} />
          <SettingsForm
            shown={shown}
            pageCurrencies={tab.currencies}
            onCurrencyChange={setCurrency}
            onSave={save}
          />
        </>
      )}
      {tab && !onSite && <NoSite />}
      <StatusCard tab={tab} rates={rates} version={version} />
    </div>
  );
}

/** Minerva saying "?" instead of the form, while the active tab is on no site. */
function NoSite() {
  return (
    <section className="my-auto text-center text-body-secondary">
      <div className="minerva-idle">
        <img src="/icons/128.png" alt="Minerva" width="96" height="96" />
        <span className="minerva-bubble" aria-hidden="true">
          ?
        </span>
      </div>
      <p className="mt-3 mb-0">No auction or site active</p>
    </section>
  );
}

/**
 * The active tab's state, freshly synced by its content script; the
 * state is judged by the URL when it has none (yet).
 */
async function activeTabState(
  tabs: PanelProps["tabs"],
  bus: PanelProps["bus"],
  sites: readonly AuctionSite[],
): Promise<TabState> {
  const [active] = await tabs.query({ active: true, currentWindow: true });
  if (!active) return TabState.inactive();
  const answer =
    active.id === undefined
      ? undefined
      : await bus.sendToTab(active.id, { type: MSG.SYNC_REQUEST });
  return answer ? TabState.from(answer) : TabState.forUrl(sites, active.url);
}
