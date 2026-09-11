// How it works
const STEPS = [
  {
    n: "01",
    title: "Connect and set your limits",
    body: "Sign in, then tell AutoVoyage your budget and what it can spend on without asking.",
  },
  {
    n: "02",
    title: "Let it plan and book the small things",
    body: "It compares flights, hotels and activities and books anything within your limits, paying sub-agents over x402 as it goes.",
  },
  {
    n: "03",
    title: "Approve the big moments yourself",
    body: "For any purchase above your ceiling, AutoVoyage pauses for a plain confirm. Everything lands in an on-chain audit trail.",
  },
];

export function HowItWorks() {
  return (
    <section className="w-full bg-av-paper px-6 py-20 md:py-28">
      <div className="mx-auto max-w-[880px]">
        <h2 className="text-center text-[clamp(26px,4vw,38px)] font-semibold tracking-[-0.02em] text-av-text">
          How it works
        </h2>
        <ol className="mt-12 flex flex-col">
          {STEPS.map(s => (
            <li key={s.n} className="flex flex-col gap-2 border-t border-av-hairline py-6 sm:flex-row sm:gap-8">
              <span className="font-mono text-[15px] font-medium text-av-muted sm:w-16 sm:pt-0.5">{s.n}</span>
              <div className="sm:flex-1">
                <h3 className="text-[17px] font-semibold text-av-text">{s.title}</h3>
                <p className="m-0 mt-1 max-w-[560px] text-[15px] leading-relaxed text-av-muted">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
