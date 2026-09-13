// Footer CTA
import Link from "next/link";
import { Wordmark } from "../brand/Wordmark";

export function FooterCta() {
  return (
    <footer className="w-full bg-av-band">
      <div className="mx-auto max-w-[880px] px-6 py-24 text-center md:py-32">
        <h2 className="mx-auto max-w-[560px] text-[clamp(26px,4vw,40px)] font-semibold leading-[1.1] tracking-[-0.02em] text-av-text">
          Hand over the busywork. Keep the control.
        </h2>
        <p className="mx-auto mt-4 max-w-[460px] text-[15px] leading-relaxed text-av-muted">
          Let AutoVoyage plan and pay within your limits, and step in only for the moments that matter.
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <Link
            href="/login"
            className="rounded bg-av-blue px-6 py-3 text-[15px] font-medium text-av-paper no-underline transition-colors hover:bg-av-blue-hover"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="text-[15px] font-medium text-av-text no-underline transition-opacity hover:opacity-60"
          >
            Talk to us
          </Link>
        </div>
      </div>
      <div className="border-t border-av-hairline">
        <div className="mx-auto flex max-w-[1080px] flex-col items-center justify-between gap-3 px-6 py-6 sm:flex-row">
          <Wordmark size={24} />
          <p className="m-0 font-mono text-[11px] uppercase tracking-[0.1em] text-av-muted">
            AutoVoyage · Hedera x402 · HIP-336 allowance · on-chain
          </p>
        </div>
      </div>
    </footer>
  );
}
