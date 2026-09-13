import { NextResponse } from "next/server";

/**
 * Public identity of the spending agent: the account a user grants their HIP-336 HBAR
 * allowance to. Account ids are public, so this exposes nothing sensitive — but it must
 * never grow to include AGENT_PRIVATE_KEY.
 *
 * The browser needs this because the allowance's spender has to match the account that
 * will later sign the payments.
 */
export async function GET() {
  const agentAccountId = process.env.AGENT_ACCOUNT_ID;
  if (!agentAccountId) {
    return NextResponse.json({ error: "AGENT_ACCOUNT_ID is not configured" }, { status: 500 });
  }

  return NextResponse.json({
    agentAccountId,
    network: process.env.NEXT_PUBLIC_X402_NETWORK ?? process.env.X402_NETWORK ?? "hedera:testnet",
    defaults: {
      totalCeilingHbar: Number(process.env.AGENT_MANDATE_TOTAL_HBAR ?? 5),
      perTxCeilingHbar: Number(process.env.AGENT_MANDATE_PER_TX_HBAR ?? 2.5),
      ttlMinutes: Number(process.env.AGENT_MANDATE_TTL_MINUTES ?? 180),
    },
  });
}
