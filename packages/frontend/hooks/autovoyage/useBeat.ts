// useBeat — lazy GSAP entrance beat
"use client";

import { type RefObject, useEffect, useRef } from "react";

type Gsap = (typeof import("gsap"))["gsap"];
type BeatAnim = { progress: (value?: number) => number } | undefined;

/**
 * Runs one GSAP "beat" against `ref` after mount — client-side only, and only when motion is
 * allowed. GSAP is imported at runtime (code-split) so it is in no initial bundle and never blocks
 * first paint. The beat container carries the `beat` class (hidden via CSS only when JS is active,
 * see globals.css); this hook reveals it and animates its contents.
 *
 * `build` may return its timeline/tween. As a safety net, if the animation hasn't finished within
 * a short window (e.g. a throttled/occluded tab froze rAF), it is force-completed with a
 * synchronous `progress(1)` so content is never left mid-animation. No-op (visible, no motion) on
 * SSR, reduced motion, a null ref, or a failed import.
 */
export function useBeat(ref: RefObject<HTMLElement | null>, build: (gsap: Gsap, el: HTMLElement) => BeatAnim): void {
  const buildRef = useRef(build);
  buildRef.current = build;

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    let ctx: ReturnType<Gsap["context"]> | undefined;
    let timer: number | undefined;
    const reveal = () => {
      el.style.opacity = "1";
    };

    void import("gsap")
      .then(({ gsap }) => {
        if (cancelled || !ref.current) return;
        reveal();
        let anim: BeatAnim = undefined;
        ctx = gsap.context(() => {
          anim = buildRef.current(gsap, el);
        }, el);
        if (anim != null) {
          timer = window.setTimeout(() => {
            if (anim != null && anim.progress() < 1) anim.progress(1);
          }, 1800);
        }
      })
      .catch(reveal);

    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
      ctx?.revert();
      reveal();
    };
  }, [ref]);
}
