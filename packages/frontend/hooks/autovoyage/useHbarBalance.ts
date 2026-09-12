// useHbarBalance — fetch a connected Hedera account's native HBAR balance
"use client";

import { useEffect, useState } from "react";
import { formatTinybar } from "~~/utils/x402";

interface HbarBalanceState {
  balanceHbar: string | null;
  isLoading: boolean;
  error: string | null;
}

/**
 * Fetches `accountId`'s native HBAR balance via the mirror-node proxy at
 * `/api/hedera/account`. Returns `null` balance/no fetch while `accountId` is null
 * (wallet not connected).
 */
export function useHbarBalance(accountId: string | null): HbarBalanceState {
  const [state, setState] = useState<HbarBalanceState>({ balanceHbar: null, isLoading: false, error: null });

  useEffect(() => {
    if (!accountId) {
      setState({ balanceHbar: null, isLoading: false, error: null });
      return;
    }

    let cancelled = false;
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    void fetch(`/api/hedera/account?accountId=${encodeURIComponent(accountId)}`)
      .then(async res => {
        if (!res.ok) throw new Error(`Balance request failed (${res.status})`);
        return (await res.json()) as { balanceTinybar?: string | null };
      })
      .then(data => {
        if (cancelled) return;
        const balanceHbar = data.balanceTinybar != null ? formatTinybar(data.balanceTinybar) : null;
        setState({ balanceHbar, isLoading: false, error: null });
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setState({ balanceHbar: null, isLoading: false, error: e instanceof Error ? e.message : "Balance failed" });
      });

    return () => {
      cancelled = true;
    };
  }, [accountId]);

  return state;
}
