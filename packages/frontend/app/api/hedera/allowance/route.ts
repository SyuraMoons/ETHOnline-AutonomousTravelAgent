import { NextResponse } from "next/server";

// Reads a live HIP-336 HBAR allowance back from Mirror Node. This is what lets the client
// recognize "I already granted this agent an allowance" after a refresh, instead of asking
// the user to sign a fresh approval every time — HBAR allowances never expire, so the only
// reason the old UI re-asked was that nothing ever read this endpoint.

const MIRROR_BASE: Record<string, string> = {
  testnet: process.env.HEDERA_MIRROR_TESTNET_URL ?? "https://testnet.mirrornode.hedera.com",
  mainnet: process.env.HEDERA_MIRROR_MAINNET_URL ?? "https://mainnet.mirrornode.hedera.com",
};

const HEDERA_ACCOUNT_ID_RE = /^\d+\.\d+\.\d+$/;
const TINYBAR_PER_HBAR = 100_000_000;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  const spender = searchParams.get("spender");
  const network = (searchParams.get("network") ?? "testnet").toLowerCase();
  const base = MIRROR_BASE[network] ?? MIRROR_BASE.testnet;

  if (!owner || !HEDERA_ACCOUNT_ID_RE.test(owner) || !spender || !HEDERA_ACCOUNT_ID_RE.test(spender)) {
    return NextResponse.json({ error: "owner and spender must be valid Hedera account ids" }, { status: 400 });
  }

  const url = `${base}/api/v1/accounts/${owner}/allowances/crypto?spender.id=${spender}`;

  try {
    // Deliberately no-store — unlike the 60s account-balance cache, a stale read here is
    // exactly the bug this endpoint exists to fix.
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: "Mirror node request failed", status: res.status }, { status: 502 });
    }

    const data = (await res.json()) as { allowances?: { spender?: string; amount?: number }[] };
    const match = data.allowances?.find(a => a.spender === spender);
    const amountTinybar = typeof match?.amount === "number" ? match.amount : 0;

    return NextResponse.json({
      amountTinybar: amountTinybar.toString(),
      amountHbar: amountTinybar / TINYBAR_PER_HBAR,
    });
  } catch (error) {
    console.error("[api/hedera/allowance]", error);
    return NextResponse.json({ error: "Resolution failed" }, { status: 502 });
  }
}
