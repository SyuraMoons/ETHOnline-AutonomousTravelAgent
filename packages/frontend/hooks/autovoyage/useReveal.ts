// useReveal — CSS-only scroll reveal (no GSAP)
"use client";

import { useEffect, useRef } from "react";

// useReveal — CSS-only scroll reveal (no GSAP)

/**
 * Adds `is-revealed` the first time the element scrolls into view, driving a pure-CSS fade/slide
 * (`.reveal` in globals.css). Zero JS animation weight. Safety net: reveals immediately with no
 * IntersectionObserver / reduced motion, and always reveals within a short fallback so content is
 * never left hidden.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof window === "undefined") return;

    const reveal = () => el.classList.add("is-revealed");

    if (!("IntersectionObserver" in window) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      reveal();
      return;
    }

    let cleanup = () => {};
    const io = new IntersectionObserver(
      entries => {
        if (entries[0]?.isIntersecting) {
          reveal();
          cleanup();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    const t = window.setTimeout(() => {
      // last-resort: force visible without depending on the transition
      el.style.transition = "none";
      el.style.opacity = "1";
      el.style.transform = "none";
      reveal();
      cleanup();
    }, 2500);
    cleanup = () => {
      io.disconnect();
      window.clearTimeout(t);
    };
    return cleanup;
  }, []);

  return ref;
}
