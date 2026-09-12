"use client";

// Inline chat budget card — the chat-embedded replacement for the old sidebar
// AuthorizeAgentCard. Connect wallet -> set a spending budget -> one HashPack allowance
// approval. After that the agent searches and pays on its own.
//
// This card is a live view of AuthorizationContext, not a snapshot: once rendered inside a
// chat message it keeps reflecting the current stage/mandate, so revoking here simply flips
// the same card back to its form view rather than requiring a freshly pushed message.
import { useEffect, useMemo, useState } from "react";
import type { MandateTerms } from "@sh/contracts";
import { useAuthorization } from "~~/services/autovoyage/authorizationContext";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";

export function ChatBudgetCard({ reasonNote }: { reasonNote?: string }) {
  const { accountId, isConnected } = useHederaWalletConnect();
  const {
    agent,
    agentError,
    stage,
    error,
    warning,
    mandate,
    mandateId,
    allowanceTxId,
    orphanedAllowanceHbar,
    authorize,
    grantAllowance,
    revoke,
    resumeFromOrphan,
  } = useAuthorization();

  const [totalHbar, setTotalHbar] = useState(5);
  // The wallet dialog is open — without this the approve button looks inert for the several
  // seconds HashPack takes, which reads as "nothing happened".
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!agent) return;
    setTotalHbar(agent.defaults.totalCeilingHbar);
  }, [agent]);

  // Per-search cap intentionally equals the total: the total ceiling is the real backstop, and
  // asking the user to reason about a second, separate limit is unnecessary friction. TTL is
  // never user-set — always the agent's default (falls back to 180min, matching the floor
  // raised in app/api/mandate/route.ts, for the brief window before /api/agent resolves).
  const terms = useMemo<MandateTerms | null>(
    () =>
      accountId
        ? {
            payerAccountId: accountId,
            totalCeilingHbar: totalHbar,
            perTxCeilingHbar: totalHbar,
            ttlMinutes: agent?.defaults.ttlMinutes ?? 180,
          }
        : null,
    [accountId, totalHbar, agent],
  );

  async function startAuthorization() {
    if (!terms) return;
    await authorize(terms);
  }

  async function submitAllowance() {
    setSubmitting(true);
    try {
      await grantAllowance();
    } finally {
      setSubmitting(false);
    }
  }

  const authorized = stage === "authorized";
  // An error raised *during* granting still has a live mandate behind it, so the way forward is
  // to retry the signature — not to mint a second mandate the allowance wasn't granted against.
  const failedWhileGranting = stage === "error" && Boolean(mandateId && terms);
  const needsAllowance = stage === "granting" || failedWhileGranting;

  if (stage === "resuming") {
    return (
      <div className="w-full max-w-[420px] rounded border border-av-border bg-av-card p-4">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-av-muted">Trip budget</span>
        <p className="m-0 mt-1 text-[13px] text-av-muted">Checking for an existing authorization…</p>
      </div>
    );
  }

  if (stage === "orphaned") {
    return (
      <div className="w-full max-w-[420px] rounded border border-av-border bg-av-card p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-av-muted">Trip budget</span>
          <span className="text-[11px] font-semibold text-av-amber">Allowance still active</span>
        </div>
        <p className="m-0 mt-1.5 text-[13px] text-av-muted">
          Your wallet still authorizes this agent to spend up to{" "}
          <span className="font-semibold text-av-text">{(orphanedAllowanceHbar ?? 0).toFixed(2)} HBAR</span> — resume
          without signing again, or revoke it.
        </p>
        {error && <p className="m-0 mt-3 text-[12px] text-av-amber">{error}</p>}
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void resumeFromOrphan()}
            className="rounded bg-av-blue px-3 py-1.5 text-[13px] font-medium text-av-paper hover:bg-av-blue-hover"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={() => void revoke()}
            className="rounded border border-av-border px-2 py-1 text-[12px] text-av-text hover:bg-av-bg"
          >
            Revoke
          </button>
        </div>
      </div>
    );
  }

  // Gated on `authorized` alone, never on `mandate` being loaded. A missing mandate object is a
  // reason to show fewer numbers, never to fall back to a view that implies the user's
  // approval did nothing.
  if (authorized) {
    const pct =
      mandate && mandate.totalCeilingHbar > 0 ? Math.round((mandate.spentHbar / mandate.totalCeilingHbar) * 100) : 0;
    return (
      <div className="w-full max-w-[420px] rounded border border-av-border bg-av-card p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-av-muted">Trip budget</span>
          <span className="text-[11px] font-semibold text-av-green">Agent authorized</span>
        </div>
        {mandate ? (
          <>
            <p className="m-0 mt-1 text-[16px] font-semibold text-av-blue">
              {mandate.remainingHbar.toFixed(2)} HBAR available to spend
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-av-blue-tint">
              <div className="h-full rounded-full bg-av-blue" style={{ width: `${pct}%` }} />
            </div>
            <p className="m-0 mt-2 text-[12px] text-av-muted">
              {mandate.spentHbar.toFixed(2)} of {mandate.totalCeilingHbar.toFixed(2)} HBAR spent
            </p>
          </>
        ) : (
          <p className="m-0 mt-1 text-[16px] font-semibold text-av-blue">{totalHbar.toFixed(2)} HBAR authorized</p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => void revoke()}
            className="rounded border border-av-border px-2 py-1 text-[12px] text-av-text hover:bg-av-bg"
          >
            Revoke
          </button>
          {allowanceTxId && (
            <a
              className="ml-auto text-[12px] text-av-blue"
              href={`https://hashscan.io/testnet/transaction/${allowanceTxId}`}
              target="_blank"
              rel="noreferrer"
            >
              View allowance on HashScan
            </a>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[420px] rounded border border-av-border bg-av-card p-4">
      <p className="m-0 text-[14px] font-semibold text-av-text">Trip budget</p>
      <p className="m-0 mt-1.5 text-[13px] text-av-muted">
        {reasonNote ?? "Set a budget, approve one allowance, and I'll buy flight data on my own from there."}
      </p>

      <div className="mt-3">
        <LabelledNumber
          label="How much HBAR do you want to spend?"
          value={totalHbar}
          onChange={setTotalHbar}
          disabled={needsAllowance}
        />
      </div>

      {agent && (
        <p className="m-0 mt-3 text-[12px] text-av-muted">
          Spender: <span className="font-mono">{agent.agentAccountId}</span>
        </p>
      )}

      {!isConnected && <p className="m-0 mt-3 text-[12px] text-av-amber">Connect your wallet first.</p>}
      {agentError && <p className="m-0 mt-3 text-[12px] text-av-amber">{agentError}</p>}
      {error && <p className="m-0 mt-3 text-[12px] text-av-amber">{error}</p>}
      {warning && <p className="m-0 mt-3 text-[12px] text-av-amber">{warning}</p>}

      {needsAllowance ? (
        <>
          <p className="m-0 mt-3 text-[12px] text-av-muted">
            Budget set. Approving replaces any existing allowance with exactly this amount — it doesn&apos;t add to it.
            This is the last signature.
          </p>
          <button
            type="button"
            onClick={() => void submitAllowance()}
            disabled={submitting}
            className="mt-3 w-full rounded bg-av-blue py-2.5 text-[14px] font-medium text-av-paper hover:bg-av-blue-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting
              ? "Waiting for your wallet…"
              : failedWhileGranting
                ? `Retry approval of ${totalHbar} HBAR`
                : `Approve ${totalHbar} HBAR allowance`}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => void startAuthorization()}
          // Never mint a second mandate while one is already live — the on-chain allowance was
          // granted against the first, and overwriting the id orphans it.
          disabled={!isConnected || stage === "creating" || Boolean(mandateId)}
          className="mt-3 w-full rounded bg-av-blue py-2.5 text-[14px] font-medium text-av-paper hover:bg-av-blue-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {stage === "creating" ? "Setting budget…" : "Set budget"}
        </button>
      )}
    </div>
  );
}

function LabelledNumber({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-av-muted">{label}</span>
      <input
        type="number"
        min={0}
        step="0.1"
        value={value}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full rounded border border-av-border bg-av-bg px-3 py-1.5 text-[14px] text-av-text [-moz-appearance:textfield] disabled:opacity-60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
    </label>
  );
}
