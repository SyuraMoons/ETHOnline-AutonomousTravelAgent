import { NextRequest, NextResponse } from "next/server";
import { getThread, saveThreadSnapshot } from "~~/services/autovoyage/chatThreads";

// GET ?payerAccountId= -> a specific thread, scoped to its owning wallet (used when switching
// into a past chat from the history dropdown).
export async function GET(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const payerAccountId = req.nextUrl.searchParams.get("payerAccountId");
  if (!payerAccountId) {
    return NextResponse.json({ error: "payerAccountId query param is required" }, { status: 400 });
  }
  const thread = await getThread(threadId, payerAccountId);
  if (!thread) {
    return NextResponse.json({ error: "no thread found" }, { status: 404 });
  }
  return NextResponse.json(thread);
}

// Whole-snapshot write — see services/autovoyage/chatThreads.ts for why this isn't an
// append-only message log. payerAccountId is required and the write is scoped to it: without
// this, any caller holding a thread UUID (a copy-pasted URL, a leaked id) could overwrite
// another wallet's entire saved session.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as {
    payerAccountId?: string;
    messages?: unknown[];
    stage?: string | null;
    trip?: unknown;
    options?: unknown;
    selected?: unknown;
    payment?: unknown;
  } | null;
  if (!body || !body.payerAccountId || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "payerAccountId and messages array are required" }, { status: 400 });
  }

  const ok = await saveThreadSnapshot(threadId, body.payerAccountId, {
    messages: body.messages,
    stage: body.stage ?? null,
    trip: body.trip ?? null,
    options: body.options ?? null,
    selected: body.selected ?? null,
    payment: body.payment ?? null,
  });
  if (!ok) {
    return NextResponse.json({ error: "no thread found for this wallet" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
