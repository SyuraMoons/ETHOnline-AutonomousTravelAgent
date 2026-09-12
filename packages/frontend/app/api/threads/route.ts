import { NextRequest, NextResponse } from "next/server";
import { createThread, getLatestThread, listThreads } from "~~/services/autovoyage/chatThreads";

// GET ?payerAccountId= -> the newest thread for that wallet, or 404 on a first visit.
// GET ?payerAccountId=&list=true -> every thread for that wallet, newest first, for the
// chat-history dropdown.
export async function GET(req: NextRequest) {
  const payerAccountId = req.nextUrl.searchParams.get("payerAccountId");
  if (!payerAccountId) {
    return NextResponse.json({ error: "payerAccountId query param is required" }, { status: 400 });
  }
  if (req.nextUrl.searchParams.get("list") === "true") {
    const threads = await listThreads(payerAccountId);
    return NextResponse.json(threads);
  }
  const thread = await getLatestThread(payerAccountId);
  if (!thread) {
    return NextResponse.json({ error: "no thread found" }, { status: 404 });
  }
  return NextResponse.json(thread);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { payerAccountId?: string };
  if (!body.payerAccountId) {
    return NextResponse.json({ error: "payerAccountId is required" }, { status: 400 });
  }
  const thread = await createThread(body.payerAccountId);
  return NextResponse.json(thread);
}
