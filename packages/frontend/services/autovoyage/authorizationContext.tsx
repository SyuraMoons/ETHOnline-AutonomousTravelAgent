"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { MandateTerms } from "@sh/contracts";
import { approveHbarAllowance, readHbarAllowance, revokeHbarAllowance } from "~~/services/web3/hbarAllowance";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";

/**
 * Holds the spending authority the user granted the agent.
 *
 * The whole point of this build: the user authorizes ONCE — set a budget, then a single
 * HashPack HIP-336 allowance approval — and from then on the agent pays the supplier with no
 * further signing. That one wallet signature IS the human authorization: it is on-chain,
 * non-custodial, and revocable at any time; the mandate below is just the app-level record of
 * the terms it was granted for.
 *
 * Two things are established here and must both be set up, in this order:
 *   1. the mandate (app-level, minted from the budget the user set)
 *   2. the HIP-336 allowance (on-chain, the hard limit Hedera itself enforces)
 * The mandate without the allowance cannot pay; the allowance without the mandate is refused
 * by /api/plan. Neither alone is sufficient, which is the intended defence in depth.
 */

export type AuthorizationStage = "idle" | "creating" | "granting" | "authorized" | "error" | "resuming" | "orphaned";

export type AgentInfo = {
  agentAccountId: string;
  network: string;
  defaults: { totalCeilingHbar: number; perTxCeilingHbar: number; ttlMinutes: number };
};

export type MandateState = {
  mandateId: string;
  totalCeilingHbar: number;
  perTxCeilingHbar: number;
  spentHbar: number;
  remainingHbar: number;
  expiresAt: string;
  status: string;
  payerAccountId?: string;
  spend?: { amountHbar: number; transaction: string; payerAccountId: string; at: string }[];
};

type AuthorizationContextValue = {
  agent: AgentInfo | null;
  /** Why `agent` is null, when it is — a server misconfiguration, not a wallet problem. */
  agentError: string | null;
  stage: AuthorizationStage;
  error: string | null;
  /** Non-blocking: the local state was reset but something on-chain may not have been. */
  warning: string | null;
  mandateId: string | null;
  mandate: MandateState | null;
  allowanceTxId: string | null;
  /** Terms currently being approved. */
  pendingTerms: MandateTerms | null;
  /** Live on-chain allowance found with no matching DB mandate — set only in stage "orphaned". */
  orphanedAllowanceHbar: number | null;
  /** Step 1: mint a mandate for these terms. */
  authorize: (terms: MandateTerms) => Promise<void>;
  /** Step 2: the single wallet signature that grants the on-chain allowance. */
  grantAllowance: () => Promise<void>;
  revoke: () => Promise<void>;
  /** Mints a mandate bound to an already-live on-chain allowance — no wallet signature. */
  resumeFromOrphan: () => Promise<void>;
  /** Also returns the fetched mandate (or null if not found/errored) so callers can branch on
   * it directly — e.g. PlanProvider's pre-flight check before spending. */
  refreshMandate: () => Promise<MandateState | null>;
};

const AuthorizationContext = createContext<AuthorizationContextValue | undefined>(undefined);

export function AuthorizationProvider({ children }: { children: ReactNode }) {
  const { provider, accountId, isConnected } = useHederaWalletConnect();

  const [agent, setAgent] = useState<AgentInfo | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [stage, setStage] = useState<AuthorizationStage>("idle");
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [mandateId, setMandateId] = useState<string | null>(null);
  const [mandate, setMandate] = useState<MandateState | null>(null);
  const [allowanceTxId, setAllowanceTxId] = useState<string | null>(null);
  const [pendingTerms, setPendingTerms] = useState<MandateTerms | null>(null);
  const [orphanedAllowanceHbar, setOrphanedAllowanceHbar] = useState<number | null>(null);

  // A failure here used to be swallowed, leaving `agent` null forever and making
  // grantAllowance() blame the wallet for what is really a server misconfiguration.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/agent")
      .then(async res => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.agentAccountId) {
          setAgentError(data?.error ?? "The agent account isn't configured on the server.");
          return;
        }
        setAgent(data as AgentInfo);
        setAgentError(null);
      })
      .catch(() => {
        if (!cancelled) setAgentError("Couldn't reach the server to look up the agent account.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Resume-on-load: reconcile the DB mandate against the live on-chain allowance once both the
  // wallet and the agent account are known. This is the fix for "I have to re-sign every
  // refresh" — the allowance itself never expired, nothing ever read it back before now.
  useEffect(() => {
    if (!accountId || !agent || stage !== "idle") return;
    let cancelled = false;

    (async () => {
      setStage("resuming");
      try {
        const [mandateRes, allowanceHbar] = await Promise.all([
          fetch(`/api/mandate?payerAccountId=${encodeURIComponent(accountId)}`),
          readHbarAllowance({
            ownerAccountId: accountId,
            spenderAccountId: agent.agentAccountId,
            network: agent.network,
          }),
        ]);
        if (cancelled) return;

        const dbMandate = mandateRes.ok ? ((await mandateRes.json()) as MandateState) : null;

        if (dbMandate && allowanceHbar > 0) {
          // Both sides agree: resume with no signature.
          setMandateId(dbMandate.mandateId);
          setMandate(dbMandate);
          setAllowanceTxId(null);
          setStage("authorized");
          return;
        }

        if (!dbMandate && allowanceHbar > 0) {
          // The allowance is still live but the app-level record of its terms is gone (e.g. a
          // server restart before Postgres was wired up, or a mandate that simply expired).
          // The agent still has real spending power — offer to resume or revoke rather than
          // silently going back to "idle" as if nothing were granted.
          setOrphanedAllowanceHbar(allowanceHbar);
          setStage("orphaned");
          return;
        }

        if (dbMandate && allowanceHbar <= 0) {
          // Revoked elsewhere (e.g. directly in HashPack, or another device) — the DB record
          // is stale. Mark it revoked so it stops showing up as active.
          await fetch(`/api/mandate?mandateId=${encodeURIComponent(dbMandate.mandateId)}`, { method: "DELETE" }).catch(
            () => {},
          );
          setStage("idle");
          return;
        }

        setStage("idle");
      } catch {
        if (!cancelled) setStage("idle");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per (accountId, agent) pair via the stage==="idle" guard, not on every stage change
  }, [accountId, agent]);

  const authorize = useCallback(async (terms: MandateTerms) => {
    setError(null);
    setWarning(null);
    setStage("creating");
    setPendingTerms(terms);
    try {
      const res = await fetch("/api/mandate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(terms),
      });
      // POST returns the complete mandate record, not just an id — keep it, so the UI has
      // something to render the moment the allowance lands instead of waiting for a refresh.
      // A non-JSON body (e.g. an unhandled 500) must not throw an opaque parse error here.
      const data = (await res.json().catch(() => ({}))) as Partial<MandateState> & { error?: string };
      if (!res.ok || !data.mandateId) {
        throw new Error(data.error ?? "Could not create the mandate");
      }
      setMandateId(data.mandateId);
      setMandate(data as MandateState);
      setStage("granting");
    } catch (err) {
      setStage("error");
      setError(err instanceof Error ? err.message : "Could not create the mandate");
    }
  }, []);

  const refreshMandate = useCallback(async () => {
    if (!mandateId) return null;
    const res = await fetch(`/api/mandate?mandateId=${encodeURIComponent(mandateId)}`);
    if (!res.ok) {
      // A 404 means the server genuinely no longer knows this mandateId (e.g. its in-memory
      // store was reset) — clearing only `mandate` and leaving `mandateId`/`stage: "authorized"`
      // set left the UI in a half-authorized dead end: BudgetCard shows "Agent authorized"
      // and disables its own "Set budget" button off `Boolean(mandateId)`, with no way out.
      // A transient network/5xx error is different — that's not proof the mandate is gone, so
      // leave state alone rather than destroying a live authorization on a blip.
      if (res.status === 404) {
        setMandateId(null);
        setMandate(null);
        setAllowanceTxId(null);
        setPendingTerms(null);
        setStage("idle");
      } else {
        setMandate(null);
      }
      return null;
    }
    const fresh = (await res.json()) as MandateState;
    setMandate(fresh);
    return fresh;
  }, [mandateId]);

  const grantAllowance = useCallback(async () => {
    // Distinguish the three ways this can be unreachable — blaming the wallet for a missing
    // server config sends the user off fixing the wrong thing.
    if (!agent) {
      setStage("error");
      setError(agentError ?? "The agent account isn't available yet — try again in a moment.");
      return;
    }
    if (!provider || !accountId) {
      setStage("error");
      setError("Connect your wallet before granting an allowance.");
      return;
    }
    if (!pendingTerms) {
      setStage("error");
      setError("Set a budget before approving an allowance.");
      return;
    }
    setError(null);
    setWarning(null);
    try {
      const txId = await approveHbarAllowance({
        ownerAccountId: accountId,
        spenderAccountId: agent.agentAccountId,
        amountHbar: pendingTerms.totalCeilingHbar,
        provider,
        network: agent.network,
      });
      setAllowanceTxId(txId);
      setStage("authorized");
      // Persist so the HashScan link, and the allowance/mandate link, survive a refresh too.
      if (mandateId) {
        void fetch("/api/mandate", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mandateId, allowanceTxId: txId }),
        }).catch(() => {});
      }
      // The agent can spend from here on; pull the live ceiling so the card shows real numbers.
      void refreshMandate();
    } catch (err) {
      setStage("error");
      setError(err instanceof Error ? err.message : "Allowance approval failed");
    }
  }, [provider, accountId, agent, agentError, pendingTerms, mandateId, refreshMandate]);

  const revoke = useCallback(async () => {
    if (!provider || !accountId || !agent) return;
    try {
      setWarning(null);
      await revokeHbarAllowance({
        ownerAccountId: accountId,
        spenderAccountId: agent.agentAccountId,
        provider,
        network: agent.network,
      });
    } catch (err) {
      // The local reset below still runs, so the UI stops claiming an authorization the user
      // ended — but the on-chain allowance is untouched, and HBAR allowances never expire.
      // Saying so is the difference between a stale UI and an agent that can still spend.
      setWarning(
        `${err instanceof Error ? err.message : "The revoke transaction failed"} — your on-chain allowance is still active. Reconnect your wallet and revoke again.`,
      );
    } finally {
      // Mark the DB record revoked too, so a later resume doesn't find a stale "active" mandate.
      if (mandateId) {
        void fetch(`/api/mandate?mandateId=${encodeURIComponent(mandateId)}`, { method: "DELETE" }).catch(() => {});
      }
      // Drop local authority even if the on-chain revoke failed, so the UI never claims
      // an authorization the user has asked to end.
      setMandateId(null);
      setMandate(null);
      setAllowanceTxId(null);
      setPendingTerms(null);
      setOrphanedAllowanceHbar(null);
      setStage("idle");
    }
  }, [provider, accountId, agent, mandateId]);

  const resumeFromOrphan = useCallback(async () => {
    if (!accountId || !agent || orphanedAllowanceHbar == null) return;
    setError(null);
    setStage("creating");
    try {
      const res = await fetch("/api/mandate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          payerAccountId: accountId,
          totalCeilingHbar: orphanedAllowanceHbar,
          perTxCeilingHbar: orphanedAllowanceHbar,
          ttlMinutes: agent.defaults.ttlMinutes,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<MandateState> & { error?: string };
      if (!res.ok || !data.mandateId) {
        throw new Error(data.error ?? "Could not resume the mandate");
      }
      setMandateId(data.mandateId);
      setMandate(data as MandateState);
      setOrphanedAllowanceHbar(null);
      setStage("authorized");
    } catch (err) {
      setStage("orphaned");
      setError(err instanceof Error ? err.message : "Could not resume the mandate");
    }
  }, [accountId, agent, orphanedAllowanceHbar]);

  // A disconnected wallet cannot have a live authorization — the agent would be spending
  // from an account the user is no longer presenting.
  //
  // Debounced deliberately: `isConnected` is recomputed on every WalletConnect session event
  // (see hederaWalletConnect.tsx), and AppKit can report a momentary false as HashPack returns
  // from the approval dialog. Reacting to that blip would silently destroy the authorization
  // the user just granted. Only a disconnect that is still true after the grace period counts.
  useEffect(() => {
    if (isConnected || (stage !== "authorized" && stage !== "orphaned")) return;
    const timer = setTimeout(() => {
      setStage("idle");
      setMandateId(null);
      setMandate(null);
      setAllowanceTxId(null);
      setPendingTerms(null);
      setOrphanedAllowanceHbar(null);
    }, 1500);
    return () => clearTimeout(timer);
  }, [isConnected, stage]);

  const value = useMemo<AuthorizationContextValue>(
    () => ({
      agent,
      agentError,
      stage,
      error,
      warning,
      mandateId,
      mandate,
      allowanceTxId,
      pendingTerms,
      orphanedAllowanceHbar,
      authorize,
      grantAllowance,
      revoke,
      resumeFromOrphan,
      refreshMandate,
    }),
    [
      agent,
      agentError,
      stage,
      error,
      warning,
      mandateId,
      mandate,
      allowanceTxId,
      pendingTerms,
      orphanedAllowanceHbar,
      authorize,
      grantAllowance,
      revoke,
      resumeFromOrphan,
      refreshMandate,
    ],
  );

  return <AuthorizationContext.Provider value={value}>{children}</AuthorizationContext.Provider>;
}

export function useAuthorization() {
  const ctx = useContext(AuthorizationContext);
  if (!ctx) throw new Error("useAuthorization must be used inside AuthorizationProvider");
  return ctx;
}
