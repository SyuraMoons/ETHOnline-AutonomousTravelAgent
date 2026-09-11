// Sponsor band
const RAILS = [
  {
    tag: "Hedera · x402",
    title: "Payments that settle per request",
    body: "The agent pays for each search and service with one signed x402 payment on Hedera. Low-fee, machine-speed settlement, capped by the allowance you set.",
  },
  {
    tag: "HIP-336 Allowance",
    title: "One signature, an on-chain ceiling",
    body: "The user approves a single HBAR allowance in their own wallet. The network enforces that ceiling directly — no further signing, and it's revocable at any time.",
  },
  {
    tag: "On-chain",
    title: "A record anyone can verify",
    body: "Every action, payment and human approval is written on-chain as a tamper-resistant audit trail that anyone can independently check.",
  },
];

export function SponsorBand() {
  return (
    <section className="w-full bg-av-ink px-6 py-20 md:py-28">
      <div className="mx-auto max-w-[880px]">
        <h2 className="max-w-[560px] text-[clamp(26px,4vw,38px)] font-semibold leading-[1.12] tracking-[-0.02em] text-av-paper">
          Real autonomous agent commerce, not a demo wrapper.
        </h2>
        <p className="mt-4 max-w-[560px] text-[15px] leading-relaxed text-av-paper/60">
          Hedera x402 moves the money per request, capped by a single on-chain allowance the user approves once.
          Every step lands on-chain.
        </p>
        <div className="mt-12 flex flex-col">
          {RAILS.map(r => (
            <div
              key={r.tag}
              className="flex flex-col gap-2 border-t border-av-paper/15 py-7 sm:flex-row sm:gap-8"
            >
              <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-av-blue sm:w-40 sm:pt-1">
                {r.tag}
              </span>
              <div className="sm:flex-1">
                <h3 className="text-[17px] font-semibold text-av-paper">{r.title}</h3>
                <p className="m-0 mt-1 max-w-[560px] text-[15px] leading-relaxed text-av-paper/60">{r.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
