// Screenshot section
import Image from "next/image";

export function ScreenshotSection() {
  return (
    <section className="w-full bg-av-paper px-6 py-20 md:py-28">
      <div className="mx-auto max-w-[1120px] text-center">
        <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-av-blue">See it in action</span>
        <h2 className="mx-auto mt-3 max-w-[720px] text-[clamp(26px,4vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em] text-av-text">
          Your trip, planned and paid, in one view.
        </h2>
        <div className="mt-10 overflow-hidden rounded border border-av-border bg-av-card">
          <Image
            src="/brand/trip-plan.png"
            alt="AutoVoyage trip plan dashboard: flights auto-approved, an over-limit hotel awaiting your confirm, and the agent panel."
            width={1440}
            height={900}
            className="h-auto w-full"
            sizes="(max-width: 1120px) 100vw, 1120px"
          />
        </div>
      </div>
    </section>
  );
}
