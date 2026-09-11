// Agent activity card
const ROWS = [
  { title: "Hired FlightSearch agent", ref: "0x7f1c…af21 · x402 agent", amount: "0.05 USDC", time: "2:31:04 PM" },
  { title: "Paid FlightSearch agent", ref: "0x7f1c…af21 · x402 agent", amount: "0.02 USDC", time: "2:31:04 PM" },
  { title: "Hired ReviewCheck agent", ref: "0x91b3…cd02 · x402 agent", amount: "0.03 USDC", time: "2:31:05 PM" },
];

export function AgentActivityCard() {
  return (
    <div className="w-full max-w-[420px] rounded border border-av-border bg-av-card p-2">
      <ul className="flex flex-col">
        {ROWS.map((r, i) => (
          <li key={r.title} className={`flex items-center gap-3 px-4 py-4 ${i > 0 ? "border-t border-av-border" : ""}`}>
            <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-av-blue-tint">
              <span className="h-2 w-2 rounded-full bg-av-blue" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 truncate text-[14px] font-medium text-av-text">{r.title}</p>
              <p className="m-0 mt-0.5 truncate font-mono text-[11px] text-av-muted">{r.ref}</p>
            </div>
            <div className="flex-shrink-0 text-right">
              <p className="m-0 font-mono text-[13px] font-medium text-av-text">{r.amount}</p>
              <p className="m-0 mt-0.5 font-mono text-[11px] text-av-muted">{r.time}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
