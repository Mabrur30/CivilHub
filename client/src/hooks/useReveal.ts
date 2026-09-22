import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

export interface UseRevealResult<T extends HTMLElement> {
  ref: React.RefObject<T | null>;
  revealed: boolean;
}

/**
 * Reveals an element the first time it scrolls into view, then stops observing
 * so the reveal never replays on scroll-back.
 *
 * Fails open in every degraded case — reduced motion, or a browser without
 * IntersectionObserver — so content is never stranded at opacity 0. Those two
 * cases are derived during render rather than pushed through state, so the
 * element is visible on its first paint rather than after a second one.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.15,
): UseRevealResult<T> {
  const ref = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [intersected, setIntersected] = useState(false);

  const canObserve =
    typeof IntersectionObserver !== "undefined" && !prefersReducedMotion;
  const revealed = intersected || !canObserve;

  useEffect(() => {
    if (!canObserve || intersected) return;

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        setIntersected(true);
        observer.unobserve(entry.target);
      },
      { threshold, rootMargin: "0px 0px -10% 0px" },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [canObserve, intersected, threshold]);

  return { ref, revealed };
}
