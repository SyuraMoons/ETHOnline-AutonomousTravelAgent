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
// append-only message log.
export async function PUT(req: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  const { threadId } = await params;
  const body = (await req.json().catch(() => null)) as {
    messages?: unknown[];
    stage?: string | null;
    trip?: unknown;
    options?: unknown;
    selected?: unknown;
    payment?: unknown;
  } | null;
  if (!body || !Array.isArray(body.messages)) {
    return NextResponse.json({ error: "messages array is required" }, { status: 400 });
  }

  await saveThreadSnapshot(threadId, {
    messages: body.messages,
    stage: body.stage ?? null,
    trip: body.trip ?? null,
    options: body.options ?? null,
    selected: body.selected ?? null,
    payment: body.payment ?? null,
  });
  return NextResponse.json({ ok: true });
}
