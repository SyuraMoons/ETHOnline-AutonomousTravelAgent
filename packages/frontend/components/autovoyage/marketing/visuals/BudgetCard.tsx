// Budget card
export function BudgetCard() {
  const spent = 460;
  const total = 1200;
  const pct = Math.round((spent / total) * 100);
  return (
    <div className="w-full max-w-[420px] rounded border border-av-border bg-av-card p-6">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-av-muted">Trip budget</span>
        <span className="text-[15px] font-semibold text-av-blue">${(total - spent).toLocaleString()} left</span>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-av-blue-tint">
        <div className="h-full rounded-full bg-av-blue" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-3 flex items-center justify-between text-[13px] text-av-muted">
        <span>
          ${spent.toLocaleString()} of ${total.toLocaleString()} spent
        </span>
        <span className="font-mono text-[11px] uppercase tracking-[0.1em]">Auto-approve ≤ $200</span>
      </div>
    </div>
  );
}
