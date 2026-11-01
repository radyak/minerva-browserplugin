import { useCallback, useEffect, useRef, useState } from "react";

import type { MessageBus } from "../browser/MessageBus.ts";
import { Currency } from "../core/currency/Currency.ts";
import { MSG } from "../core/messages.ts";
import { ExchangeRates } from "../core/rates/ExchangeRates.ts";

type Bus = Pick<MessageBus, "send">;

/**
 * The exchange rates of `code` (the currency picked in the panel), loaded by
 * the background. Only the latest pick counts: a superseded request is dropped
 * when it arrives, so fast currency switches never end with stale rates on
 * screen or in storage.
 * @returns `rates`: undefined while loading, null when unavailable;
 *   `ratesFor(code)`: the rates of the latest request once it is done, when
 *   they are for `code` - what Save stores with the settings
 */
export function useRates(bus: Bus, code: string | null) {
  const [loaded, setLoaded] = useState<{ code: string; rates: ExchangeRates | null } | null>(null);
  const latest = useRef<Promise<ExchangeRates | null>>(Promise.resolve(null));

  useEffect(() => {
    if (code === null) return;
    let current = true;
    const request = requestRates(bus, code).catch(() => null);
    latest.current = request;
    request.then((rates) => {
      if (current) setLoaded({ code, rates });
    });
    return () => {
      current = false;
    };
  }, [bus, code]);

  const ratesFor = useCallback(async (wanted: string) => {
    const rates = await latest.current;
    return rates?.base === wanted ? rates : null;
  }, []);

  return { rates: loaded?.code === code ? loaded.rates : undefined, ratesFor };
}

/** The current rates of `code`, from the background; rejects when unavailable. */
async function requestRates(bus: Bus, code: string): Promise<ExchangeRates> {
  const answer = await bus.send({ type: MSG.GET_RATES, base: code });
  if (!answer) throw new Error("Exchange rates unavailable");
  if ("error" in answer) throw new Error(answer.error);
  return ExchangeRates.fromJSON(answer.rates, code, Currency.CODES);
}
