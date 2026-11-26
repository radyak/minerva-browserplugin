import { useEffect, useState } from "react";

import type { MessageBus } from "../browser/MessageBus.ts";
import { UserCurrency, type UserCurrencyOption } from "../core/currency/UserCurrency.ts";
import { MSG } from "../core/messages.ts";

/**
 * The currencies the user can pick, from the rates API (through the
 * background), asked for once per panel.
 * @returns the API's list; `UserCurrency.fallback()` until it has arrived,
 *   and for good when it is unavailable
 */
export function useCurrencies(bus: Pick<MessageBus, "send">): readonly UserCurrencyOption[] {
  const [currencies, setCurrencies] = useState<readonly UserCurrencyOption[]>(FALLBACK);
  useEffect(() => {
    let current = true;
    bus
      .send({ type: MSG.GET_CURRENCIES })
      .then((answer) => {
        if (current && answer && "currencies" in answer) setCurrencies(answer.currencies);
      })
      .catch(() => {});
    return () => {
      current = false;
    };
  }, [bus]);
  return currencies;
}

const FALLBACK = Object.freeze(UserCurrency.fallback());
