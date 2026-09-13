import "server-only";
import { db } from "~~/services/db/supabase";

/**
 * One row per (wallet, session) — see supabase/schema.sql `chat_threads`. Whole-snapshot
 * read/write rather than an append-only message log: PlanProvider already holds the complete,
 * authoritative `messages`/`stage`/`trip`/`options`/`selected`/`payment` state in memory, so
 * writing it back as one row on change (and reading it back as one row on mount) is simpler
 * and has no interleaving/duplication hazard the way per-message appends would.
 */

export type ThreadSnapshot = {
  threadId: string;
  messages: unknown[];
  stage: string | null;
  trip: unknown;
  options: unknown;
  selected: unknown;
  payment: unknown;
};

type ThreadRow = {
  thread_id: string;
  messages: unknown[];
  stage: string | null;
  trip: unknown;
  options: unknown;
  selected: unknown;
  payment: unknown;
};

function fromRow(row: ThreadRow): ThreadSnapshot {
  return {
    threadId: row.thread_id,
    messages: row.messages ?? [],
    stage: row.stage,
    trip: row.trip,
    options: row.options,
    selected: row.selected,
    payment: row.payment,
  };
}

export type ThreadListItem = { threadId: string; updatedAt: string; title: string };

/** First user bubble's text, trimmed for a history-list label — there's no dedicated `title`
 * column, so the title is derived on read rather than stored. */
function titleFromMessages(messages: unknown[]): string {
  for (const m of messages) {
    if (m && typeof m === "object" && (m as { from?: unknown }).from === "user") {
      const text = (m as { text?: unknown }).text;
      if (typeof text === "string" && text.trim().length > 0) {
        const trimmed = text.trim();
        return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
      }
    }
  }
  return "New chat";
}

/** Newest thread for a wallet, or undefined if this is a first visit. */
export async function getLatestThread(payerAccountId: string): Promise<ThreadSnapshot | undefined> {
  const { data, error } = await db()
    .from("chat_threads")
    .select()
    .eq("payer_account_id", payerAccountId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`getLatestThread: ${error.message}`);
  return data ? fromRow(data as ThreadRow) : undefined;
}

/** A single thread scoped to its owning wallet — used when switching into a past chat, so one
 * wallet can't read another's thread by guessing a UUID. */
export async function getThread(threadId: string, payerAccountId: string): Promise<ThreadSnapshot | undefined> {
  const { data, error } = await db()
    .from("chat_threads")
    .select()
    .eq("thread_id", threadId)
    .eq("payer_account_id", payerAccountId)
    .maybeSingle();
  if (error) throw new Error(`getThread: ${error.message}`);
  return data ? fromRow(data as ThreadRow) : undefined;
}

/** Every thread for a wallet, newest first, for the chat-history list. */
export async function listThreads(payerAccountId: string): Promise<ThreadListItem[]> {
  const { data, error } = await db()
    .from("chat_threads")
    .select("thread_id, updated_at, messages")
    .eq("payer_account_id", payerAccountId)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) throw new Error(`listThreads: ${error.message}`);
  return (data ?? []).map(row => ({
    threadId: (row as { thread_id: string }).thread_id,
    updatedAt: (row as { updated_at: string }).updated_at,
    title: titleFromMessages((row as { messages: unknown[] }).messages ?? []),
  }));
}

export async function createThread(payerAccountId: string): Promise<ThreadSnapshot> {
  const row = { thread_id: crypto.randomUUID(), payer_account_id: payerAccountId };
  const { data, error } = await db().from("chat_threads").insert(row).select().single();
  if (error) throw new Error(`createThread: ${error.message}`);
  return fromRow(data as ThreadRow);
}

/**
 * Scoped by payerAccountId, same as getThread — a write with no owner check would let anyone
 * holding a thread UUID overwrite another wallet's saved session. `.select()` lets the caller
 * tell "updated" from "no such thread for this wallet" (Supabase's plain `.update()` doesn't
 * error on a zero-row match).
 */
export async function saveThreadSnapshot(
  threadId: string,
  payerAccountId: string,
  snapshot: Omit<ThreadSnapshot, "threadId">,
): Promise<boolean> {
  const { data, error } = await db()
    .from("chat_threads")
    .update({
      messages: snapshot.messages,
      stage: snapshot.stage,
      trip: snapshot.trip,
      options: snapshot.options,
      selected: snapshot.selected,
      payment: snapshot.payment,
      updated_at: new Date().toISOString(),
    })
    .eq("thread_id", threadId)
    .eq("payer_account_id", payerAccountId)
    .select("thread_id");
  if (error) throw new Error(`saveThreadSnapshot: ${error.message}`);
  return (data?.length ?? 0) > 0;
}
