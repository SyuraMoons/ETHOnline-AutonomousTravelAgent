import type { HederaProvider } from "@hashgraph/hedera-wallet-connect";

/**
 * HIP-336 HBAR allowance management from the browser wallet.
 *
 * This is the single signature that replaces per-payment signing: the user approves the
 * agent as a spender up to N HBAR once, and the agent then pays the supplier autonomously
 * (see services/x402/allowanceSigner.ts).
 *
 * Unlike the x402 payment path — which partially signs and hands the bytes to the
 * facilitator — this is an ordinary wallet write the user pays for and submits themselves,
 * so it uses `hedera_signAndExecuteTransaction`.
 *
 * Heavy SDK imports are dynamic so they stay out of the initial bundle; the wallet is only
 * ever used at the moment someone actually authorizes.
 */

/** Thrown by submitAllowance() with copy that's safe to show the user directly — never a raw
 * SDK/WalletConnect error string, which tends to be opaque (e.g. "Error: Missing or invalid
 * topic field"). */
export class AllowanceSigningError extends Error {}

export type AllowanceParams = {
  /** The user's account — the one whose HBAR will be spent. */
  ownerAccountId: string;
  /** The agent's account, from GET /api/agent. */
  spenderAccountId: string;
  amountHbar: number;
  provider: HederaProvider;
  /** CAIP-2, e.g. "hedera:testnet". Must match the network the agent pays on. */
  network: string;
};

/**
 * Grants (or replaces) the agent's HBAR allowance.
 *
 * Note this SETS the allowance rather than adding to it: approving 5 HBAR twice leaves an
 * allowance of 5, not 10. Re-approving is therefore also how you top back up after spending.
 */
export async function approveHbarAllowance(params: AllowanceParams): Promise<string> {
  return submitAllowance(params);
}

/**
 * Revokes the allowance by approving zero, which HAPI treats as removal
 * (services_crypto_approve_allowance.proto: "If the `amount` field ... is `0`, then that
 * allowance ... SHALL be removed").
 *
 * This matters more than it looks: Hedera HBAR allowances DO NOT EXPIRE. The mandate's
 * expiry is app-level only, so ending a session without revoking leaves the agent able to
 * spend on-chain indefinitely.
 */
export async function revokeHbarAllowance(params: Omit<AllowanceParams, "amountHbar">): Promise<string> {
  return submitAllowance({ ...params, amountHbar: 0 });
}

/**
 * Reads the live on-chain allowance back from Mirror Node via the server proxy
 * (app/api/hedera/allowance/route.ts). This is what lets a refreshed page recognize an
 * allowance already granted, instead of asking the user to re-sign — the allowance itself
 * never expires, only the app previously never looked.
 */
export async function readHbarAllowance(params: {
  ownerAccountId: string;
  spenderAccountId: string;
  /** CAIP-2, e.g. "hedera:testnet" — the "hedera:" prefix is stripped for the mirror node call. */
  network: string;
}): Promise<number> {
  const bareNetwork = params.network.split(":").pop() ?? "testnet";
  const url = `/api/hedera/allowance?owner=${encodeURIComponent(params.ownerAccountId)}&spender=${encodeURIComponent(
    params.spenderAccountId,
  )}&network=${encodeURIComponent(bareNetwork)}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return 0;
  const data = (await res.json().catch(() => null)) as { amountHbar?: number } | null;
  return typeof data?.amountHbar === "number" ? data.amountHbar : 0;
}

/** Classifies an opaque wallet/WalletConnect error into copy the user can act on. */
function classifySigningError(err: unknown): AllowanceSigningError {
  if (err instanceof AllowanceSigningError) return err;
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.toLowerCase();

  if (msg.includes("reject") || msg.includes("denied") || msg.includes("user cancel") || msg.includes("user closed")) {
    return new AllowanceSigningError(
      "You declined the allowance approval in your wallet — the agent still can't spend until this is approved.",
    );
  }
  if (
    msg.includes("session") ||
    msg.includes("not connect") ||
    msg.includes("disconnect") ||
    msg.includes("no matching key") ||
    msg.includes("pairing")
  ) {
    return new AllowanceSigningError(
      "Your wallet session looks disconnected. Reconnect HashPack and try approving again.",
    );
  }
  if (msg.includes("network") || msg.includes("chain") || msg.includes("namespace")) {
    return new AllowanceSigningError(
      "Your wallet is on the wrong network for this agent. Switch HashPack to the same network and retry.",
    );
  }
  return new AllowanceSigningError(`Allowance approval failed: ${raw || "unknown wallet error"}`);
}

async function submitAllowance(params: AllowanceParams): Promise<string> {
  const { ownerAccountId, spenderAccountId, provider, network, amountHbar } = params;
  if (!ownerAccountId) throw new AllowanceSigningError("Connect your wallet before granting an allowance.");
  if (!provider) {
    throw new AllowanceSigningError(
      "Your wallet session looks disconnected. Reconnect HashPack and try approving again.",
    );
  }
  if (ownerAccountId === spenderAccountId) {
    throw new AllowanceSigningError("The agent cannot be granted an allowance on its own account.");
  }

  const [{ AccountAllowanceApproveTransaction, AccountId, Hbar }, { transactionToBase64String }] = await Promise.all([
    import("@hiero-ledger/sdk"),
    import("@hashgraph/hedera-wallet-connect"),
  ]);

  const tx = new AccountAllowanceApproveTransaction().approveHbarAllowance(
    AccountId.fromString(ownerAccountId),
    AccountId.fromString(spenderAccountId),
    new Hbar(amountHbar),
  );

  try {
    // Same transport as services/web3/hederaContractWrite.ts: HashPack expects a base64
    // TransactionList, not an SDK object over WalletConnect.
    const result = await provider.hedera_signAndExecuteTransaction({
      signerAccountId: `${network}:${ownerAccountId}`,
      // @x402/hedera is pinned to 2.13.2 (see AGENTS.md), which forces this workspace's own
      // @hiero-ledger/sdk down to the exact 2.80.0 it requires, while @hashgraph/hedera-wallet-connect
      // still resolves its own nested 2.87.0 — two structurally identical but nominally distinct
      // Transaction classes. Runtime-safe (both just serialize to the same protobuf bytes).
      transactionList: transactionToBase64String(tx as never),
    });

    if (!result?.transactionId) {
      throw new AllowanceSigningError("Wallet did not return a transaction id for the allowance approval.");
    }
    return result.transactionId;
  } catch (err) {
    throw classifySigningError(err);
  }
}
