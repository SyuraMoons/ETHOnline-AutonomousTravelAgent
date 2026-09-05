export default function Home() {
  return (
    <main className="grid h-screen grid-cols-[280px_1fr_320px] gap-4 p-4">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
        <h2 className="text-sm font-semibold text-[var(--muted)]">Mandate</h2>
        {/* TODO Phase 1: render the active Mandate (ceilings, spent, remaining, status)
            from usePlanStore, populated via POST /api/mandate. */}
        <p className="mt-2 text-sm text-[var(--muted)]">No mandate set.</p>
      </section>

      <section className="flex flex-col gap-4 rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
        <h2 className="text-sm font-semibold text-[var(--muted)]">Brief &amp; Plan</h2>
        {/* TODO Phase 1: trip brief input, streamed plan from POST /api/plan,
            itinerary legs, refusals, and the World ID consent gate before /api/execute. */}
        <p className="text-sm text-[var(--muted)]">Plan will appear here.</p>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--panel)] p-4">
        <h2 className="text-sm font-semibold text-[var(--muted)]">Payment Log</h2>
        {/* TODO Phase 1: render the AuditEvent stream for the active plan from
            GET /api/audit/[planId] (HCS-backed). */}
        <p className="mt-2 text-sm text-[var(--muted)]">No activity yet.</p>
      </section>
    </main>
  );
}
