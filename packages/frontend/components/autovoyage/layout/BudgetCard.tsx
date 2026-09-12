"use client";

// Sidebar budget card — the single place to set the agent's HBAR spending budget: connect
// wallet -> set a spending budget -> one HashPack allowance approval. After that the agent
// searches and pays on its own.
//
// This card is a live view of AuthorizationContext, not a snapshot: it keeps reflecting the
// current stage/mandate, so revoking here simply flips the same card back to its form view.
import { useEffect, useMemo, useState } from "react";
import type { MandateTerms } from "@sh/contracts";
import { useFetchHbarPrice } from "~~/hooks/scaffold-hbar";
import { useAuthorization } from "~~/services/autovoyage/authorizationContext";
import { useHederaWalletConnect } from "~~/services/web3/hederaWalletConnect";

export function BudgetCard({ reasonNote }: { reasonNote?: string }) {
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
  // Controlled text, not a derived number — so the field doesn't fight the user mid-keystroke
  // on partial values like "12.".
  const [usdText, setUsdText] = useState("");
  // The wallet dialog is open — without this the approve button looks inert for the several
  // seconds HashPack takes, which reads as "nothing happened".
  const [submitting, setSubmitting] = useState(false);

  const { price: hbarUsd, isLoading: priceLoading } = useFetchHbarPrice();
  const priceAvailable = !priceLoading && hbarUsd > 0;

  useEffect(() => {
    if (!agent) return;
    setTotalHbar(agent.defaults.totalCeilingHbar);
  }, [agent]);

  // Seed the USD field once the price feed becomes available, from whatever HBAR amount is
  // canonical at that moment — never overwrites the user's own typing on later price refreshes.
  useEffect(() => {
    if (!priceAvailable) return;
    setUsdText((totalHbar * hbarUsd).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceAvailable, agent]);

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

  function handleUsdChange(raw: string) {
    setUsdText(raw);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0 && hbarUsd > 0) {
      setTotalHbar(parsed / hbarUsd);
    }
  }

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
      <div className="rounded border border-av-border p-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-av-muted">Trip budget</span>
        <p className="m-0 mt-1 text-[13px] text-av-muted">Checking for an existing authorization…</p>
      </div>
    );
  }

  if (stage === "orphaned") {
    return (
      <div className="rounded border border-av-border p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-av-muted">Trip budget</span>
          <span className="text-[11px] font-semibold text-av-amber">Allowance still active</span>
        </div>
        <p className="m-0 mt-1.5 text-[13px] text-av-muted">
          Your wallet still authorizes this agent to spend up to{" "}
          <span className="font-semibold text-av-text">
            {(orphanedAllowanceHbar ?? 0).toFixed(2)} HBAR
            {priceAvailable && ` (~$${((orphanedAllowanceHbar ?? 0) * hbarUsd).toFixed(2)})`}
          </span>{" "}
          — resume without signing again, or revoke it.
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
      <div className="rounded border border-av-border p-3">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-av-muted">Trip budget</span>
          <span className="text-[11px] font-semibold text-av-green">Agent authorized</span>
        </div>
        {mandate ? (
          <>
            <p className="m-0 mt-1 text-[16px] font-semibold text-av-blue">
              {mandate.remainingHbar.toFixed(2)} HBAR available
              {priceAvailable && (
                <span className="ml-1 text-[13px] font-normal text-av-muted">
                  (~${(mandate.remainingHbar * hbarUsd).toFixed(2)})
                </span>
              )}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-av-blue-tint">
              <div className="h-full rounded-full bg-av-blue" style={{ width: `${pct}%` }} />
            </div>
            <p className="m-0 mt-2 text-[12px] text-av-muted">
              {mandate.spentHbar.toFixed(2)} of {mandate.totalCeilingHbar.toFixed(2)} HBAR spent
              {priceAvailable &&
                ` (~$${(mandate.spentHbar * hbarUsd).toFixed(2)} of ~$${(mandate.totalCeilingHbar * hbarUsd).toFixed(2)})`}
            </p>
          </>
        ) : (
          <p className="m-0 mt-1 text-[16px] font-semibold text-av-blue">
            {totalHbar.toFixed(2)} HBAR authorized
            {priceAvailable && (
              <span className="ml-1 text-[13px] font-normal text-av-muted">(~${(totalHbar * hbarUsd).toFixed(2)})</span>
            )}
          </p>
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
    <div className="rounded border border-av-border p-3">
      <p className="m-0 text-[14px] font-semibold text-av-text">Trip budget</p>
      <p className="m-0 mt-1.5 text-[13px] text-av-muted">
        {reasonNote ?? "Covers the agent's data fees — not your flight fare."}
      </p>

      <div className="mt-3">
        {priceAvailable ? (
          <LabelledUsdNumber
            label="Data-fee cap"
            value={usdText}
            onChange={handleUsdChange}
            hbarValue={totalHbar}
            disabled={needsAllowance}
          />
        ) : (
          <LabelledNumber label="Data-fee cap" value={totalHbar} onChange={setTotalHbar} disabled={needsAllowance} />
        )}
        <p className="m-0 mt-1.5 text-[11px] text-av-muted">Searches ~$0.10–$2.50, booking ~$1.</p>
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
            {submitting ? (
              "Waiting for your wallet…"
            ) : (
              <>
                {failedWhileGranting
                  ? `Retry approval of ${totalHbar.toFixed(2)} HBAR`
                  : `Approve ${totalHbar.toFixed(2)} HBAR allowance`}
                {priceAvailable && (
                  <span className="ml-1 font-normal opacity-80">(~${(totalHbar * hbarUsd).toFixed(2)})</span>
                )}
              </>
            )}
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

function LabelledUsdNumber({
  label,
  value,
  onChange,
  hbarValue,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (raw: string) => void;
  hbarValue: number;
  disabled?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] text-av-muted">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-av-muted">
          $
        </span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={value}
          disabled={disabled}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded border border-av-border bg-av-bg px-3 py-1.5 pl-6 text-[14px] text-av-text [-moz-appearance:textfield] disabled:opacity-60 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
      <span className="text-[11px] text-av-muted">≈ {hbarValue.toFixed(2)} HBAR</span>
    </label>
  );
}
