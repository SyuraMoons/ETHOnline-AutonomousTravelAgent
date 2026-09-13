import { NextRequest, NextResponse } from "next/server";
import {
  createMandate,
  getMandate,
  getMandateForPayer,
  getSpendLog,
  revokeMandate,
  setAllowanceTx,
} from "~~/services/autovoyage/mandate";

// A chat session can easily run longer than a quick "set a budget" click; enforcing this floor
// server-side (regardless of what the client sends) stops a short TTL from expiring the
// mandate mid-conversation.
const MIN_TTL_MINUTES = 30;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    totalCeilingHbar?: number;
    perTxCeilingHbar?: number;
    ttlMinutes?: number;
    payerAccountId?: string;
  };

  // payerAccountId is the connected wallet whose HBAR this mandate spends. The mandate has no
  // proof of humanity behind it — the on-chain HIP-336 allowance the user grants next is the
  // real authorization, and the hard ceiling the network enforces regardless of this mandate.
  if (!body.payerAccountId) {
    return NextResponse.json({ error: "payerAccountId is required" }, { status: 400 });
  }

  try {
    const mandate = await createMandate({
      totalCeilingHbar: body.totalCeilingHbar ?? Number(process.env.AGENT_MANDATE_TOTAL_HBAR ?? 5),
      perTxCeilingHbar: body.perTxCeilingHbar ?? Number(process.env.AGENT_MANDATE_PER_TX_HBAR ?? 2.5),
      ttlMinutes: Math.max(body.ttlMinutes ?? Number(process.env.AGENT_MANDATE_TTL_MINUTES ?? 180), MIN_TTL_MINUTES),
      payerAccountId: body.payerAccountId,
    });
    return NextResponse.json(mandate);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not create the mandate" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { mandateId?: string; allowanceTxId?: string };
  if (!body.mandateId || !body.allowanceTxId) {
    return NextResponse.json({ error: "mandateId and allowanceTxId are required" }, { status: 400 });
  }
  try {
    await setAllowanceTx(body.mandateId, body.allowanceTxId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not record the allowance" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const mandateId = req.nextUrl.searchParams.get("mandateId");
  if (!mandateId) {
    return NextResponse.json({ error: "mandateId query param is required" }, { status: 400 });
  }
  try {
    await revokeMandate(mandateId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not revoke the mandate" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  const mandateId = req.nextUrl.searchParams.get("mandateId");
  const payerAccountId = req.nextUrl.searchParams.get("payerAccountId");

  if (!mandateId && !payerAccountId) {
    return NextResponse.json({ error: "mandateId or payerAccountId query param is required" }, { status: 400 });
  }

  try {
    // payerAccountId mode: how a refreshed client relocates its own mandate without holding the id.
    const mandate = mandateId ? await getMandate(mandateId) : await getMandateForPayer(payerAccountId as string);
    if (!mandate) {
      return NextResponse.json({ error: "mandate not found" }, { status: 404 });
    }
    // Spend log included so the UI can show what the agent actually spent, per transaction,
    // without a second round trip.
    return NextResponse.json({ ...mandate, spend: await getSpendLog(mandate.mandateId) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not read the mandate" },
      { status: 500 },
    );
  }
}
