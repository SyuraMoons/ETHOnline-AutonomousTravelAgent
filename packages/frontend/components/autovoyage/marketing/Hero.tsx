// Hero
"use client";

import { useRef } from "react";
import { GlassPromptCard } from "./GlassPromptCard";
import { MarketingNav } from "./MarketingNav";
import { TrustStrip } from "./TrustStrip";
import { useBeat } from "~~/hooks/autovoyage/useBeat";

// Hero

const HERO_VIDEO_SRC =
  "https://pollen-batch-41236914.figma.site/_components/v2/f0ee2dae7671c170c34f12e31c4cb41418976c98/769c564298c132f7919405cd9f17c1b1231f341d.769c5642.mp4";

export function Hero() {
  const contentRef = useRef<HTMLDivElement>(null);
  useBeat(contentRef, (gsap, el) =>
    gsap.from(el.children, { y: 16, opacity: 0, duration: 0.6, stagger: 0.08, ease: "power3.out" }),
  );

  return (
    <section className="relative min-h-svh w-full overflow-hidden bg-av-paper">
      <video
        className="absolute inset-0 z-0 h-full w-full object-cover"
        src={HERO_VIDEO_SRC}
        autoPlay
        muted
        loop
        playsInline
        aria-hidden
      />

      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-[687px]"
        style={{ background: "linear-gradient(180deg, rgba(245,244,241,1) 0%, rgba(245,244,241,0) 100%)" }}
      />

      <div className="relative z-[2] mx-auto max-w-[1360px]">
        <MarketingNav />
        <div ref={contentRef} className="beat flex flex-col items-center px-6 pb-24 pt-12 text-center">
          <span className="mb-4 font-mono text-[11px] uppercase tracking-[0.14em] text-av-blue">
            Autonomous travel, under your control
          </span>
          <h1 className="mb-5 max-w-[820px] text-[clamp(38px,6vw,64px)] font-semibold leading-[1.05] tracking-[-0.03em] text-av-text">
            The travel agent that books your trip, and never oversteps.
          </h1>
          <p className="mb-10 max-w-[540px] text-xl font-medium leading-relaxed text-av-muted">
            Tell AutoVoyage where you are going and what you love. It plans, pays as it goes, and pauses for your face
            check before anything big.
          </p>
          <GlassPromptCard />
          <TrustStrip />
        </div>
      </div>
    </section>
  );
}
