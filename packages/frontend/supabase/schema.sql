-- Schema for the persistence layer described in AGENTS.md / the mandate engine.
-- Apply by pasting into the Supabase SQL editor. RLS stays OFF — only the service-role
-- key (server-side route handlers) ever connects; nothing here is exposed to anon/client.

create table if not exists mandates (
  mandate_id          uuid primary key,
  -- Nullable: getOrCreateDefaultMandate() (services/autovoyage/mandate.ts) creates a
  -- payer-less mandate for the ALLOW_UNAUTHORIZED_MANDATE=true dev/treasury-mode path, where
  -- the agent spends its own balance rather than a user's allowance. A not-null constraint
  -- here made every such insert fail.
  payer_account_id    text,
  total_ceiling_hbar  numeric not null,
  per_tx_ceiling_hbar numeric not null,
  spent_hbar          numeric not null default 0,
  expires_at          timestamptz not null,
  status              text not null default 'active',
  allowance_tx_id     text,
  created_at          timestamptz not null default now(),
  revoked_at          timestamptz
);
create index if not exists mandates_payer_active_idx
  on mandates (payer_account_id, status, expires_at desc);
-- Re-run safe: relaxes payer_account_id to nullable if this schema was applied before that
-- column was made nullable above.
alter table mandates alter column payer_account_id drop not null;

create table if not exists spend_records (
  id               bigserial primary key,
  mandate_id       uuid not null references mandates on delete cascade,
  amount_hbar      numeric not null,
  transaction      text not null,
  payer_account_id text not null,
  at               timestamptz not null default now()
);
-- Idempotency: a retried commit for an already-logged settlement must not double-charge.
create unique index if not exists spend_records_tx_idx on spend_records (transaction);

create table if not exists reservations (
  reservation_id uuid primary key,
  mandate_id     uuid not null references mandates on delete cascade,
  amount_hbar    numeric not null,
  created_at     timestamptz not null default now()
);

create table if not exists consent_sessions (
  session_id     text primary key,
  itinerary_hash text not null,
  mandate_id     uuid,
  created_at     timestamptz not null default now(),
  consumed_at    timestamptz
);

create table if not exists dossiers (
  dossier_id text primary key,
  data       jsonb not null,
  created_at timestamptz not null default now()
);

-- One row per chat/plan session, keyed by the connected wallet. `messages` is the full
-- ChatMessage[] array (see types/autovoyage/plan.ts), and stage/trip/options/selected/payment
-- mirror PlanProvider's own state shape verbatim — the whole session is written back as one
-- snapshot on change and read back as one snapshot on mount, so there's nothing to reconcile.
create table if not exists chat_threads (
  thread_id        uuid primary key,
  payer_account_id text not null,
  messages         jsonb not null default '[]'::jsonb,
  stage            text,
  trip             jsonb,
  options          jsonb,
  selected         jsonb,
  payment          jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists chat_threads_payer_idx on chat_threads (payer_account_id, updated_at desc);

-- Marks an execution token's jti as spent (see services/autovoyage/executionToken.ts). The
-- primary key gives the insert-or-conflict in claimExecutionToken() its atomicity: two
-- concurrent /api/execute calls for the same token can't both win.
create table if not exists used_execution_tokens (
  jti      text primary key,
  used_at  timestamptz not null default now()
);

-- Atomic settle: delete the reservation, log the spend (idempotent on `transaction`), and
-- increment spent_hbar in one statement — never a read-modify-write, so two concurrent legs
-- of a round trip cannot clobber each other's spend total.
create or replace function commit_spend(
  p_reservation_id uuid,
  p_transaction text,
  p_payer_account_id text
) returns boolean as $$
declare
  v_mandate_id uuid;
  v_amount numeric;
begin
  select mandate_id, amount_hbar into v_mandate_id, v_amount
  from reservations where reservation_id = p_reservation_id;

  if v_mandate_id is null then
    -- Reservation already gone — most likely reclaimed by the RESERVATION_TTL_MS sweep in
    -- reservedFor() (mandate.ts) while this payment was still settling. The HBAR really moved
    -- (this is only called after a successful settlement) but spent_hbar can no longer be
    -- credited for it. Returning false lets the caller at least log this rather than let it
    -- pass silently.
    return false;
  end if;

  delete from reservations where reservation_id = p_reservation_id;

  insert into spend_records (mandate_id, amount_hbar, transaction, payer_account_id)
  values (v_mandate_id, v_amount, p_transaction, p_payer_account_id)
  on conflict (transaction) do nothing;

  update mandates
  set spent_hbar = spent_hbar + v_amount,
      status = case when spent_hbar + v_amount >= total_ceiling_hbar then 'exhausted' else status end
  where mandate_id = v_mandate_id;

  return true;
end;
$$ language plpgsql;
