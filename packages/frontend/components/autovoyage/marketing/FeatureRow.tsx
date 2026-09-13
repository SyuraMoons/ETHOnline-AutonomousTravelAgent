// Feature row
import type { ReactNode } from "react";

export function FeatureRow({
  eyebrow,
  heading,
  body,
  bullets,
  visual,
  reverse = false,
  band = false,
}: {
  eyebrow: string;
  heading: string;
  body: string;
  bullets: string[];
  visual: ReactNode;
  reverse?: boolean;
  band?: boolean;
}) {
  return (
    <section className={band ? "w-full bg-av-band" : "w-full bg-av-paper"}>
      <div
        className={`mx-auto flex max-w-[1080px] flex-col items-center gap-10 px-6 py-16 md:py-24 lg:gap-16 ${
          reverse ? "lg:flex-row-reverse" : "lg:flex-row"
        }`}
      >
        <div className="w-full lg:w-1/2">
          <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-av-blue">{eyebrow}</span>
          <h2 className="mt-3 max-w-[420px] text-[clamp(24px,3.4vw,34px)] font-semibold leading-[1.12] tracking-[-0.02em] text-av-text">
            {heading}
          </h2>
          <p className="mt-4 max-w-[440px] text-[15px] leading-relaxed text-av-muted">{body}</p>
          <ul className="mt-6 flex flex-col gap-2.5">
            {bullets.map(b => (
              <li key={b} className="flex items-start gap-3 text-[15px] text-av-text">
                <span className="mt-2.5 h-px w-3 flex-shrink-0 bg-av-blue" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
        </div>
        <div className="flex w-full justify-center lg:w-1/2">{visual}</div>
      </div>
    </section>
  );
}
