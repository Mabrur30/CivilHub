import { useEffect, useRef } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const MOBILE_BREAKPOINT = 768;

/**
 * Drifts a background layer against page scroll.
 *
 * Writes the transform straight to the node rather than through React state, so
 * scrolling never triggers a render. Disabled under reduced motion and on narrow
 * viewports, where scroll-linked transforms fight touch momentum and read as jank.
 *
 * The drift is clamped to the layer's own overflow, worked out from `scale`, so
 * the translate can never push the scaled-up layer far enough to expose an edge
 * at the section's bounds. `scale` must match the CSS scale applied to the node.
 */
export function useParallax<T extends HTMLElement = HTMLDivElement>(
  factor = 0.18,
  scale = 1.25,
): React.RefObject<T | null> {
  const ref = useRef<T | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (prefersReducedMotion || window.innerWidth < MOBILE_BREAKPOINT) {
      node.style.transform = "";
      return;
    }

    let frame = 0;

    const update = (): void => {
      frame = 0;
      const rect = node.getBoundingClientRect();
      const viewportHeight = window.innerHeight;

      // Distance of the section's centre from the viewport's centre: zero when
      // the section is centred, so the image sits at rest mid-pass.
      const distanceFromCentre =
        rect.top + rect.height / 2 - viewportHeight / 2;

      // Half the extra height the scale buys us is all the room the layer has
      // to move before its edge reaches the section boundary. rect is measured
      // on the already-scaled node, so the unscaled height is divided back out
      // rather than multiplied up.
      const headroom = (rect.height * (1 - 1 / scale)) / 2;
      const offset = Math.max(
        -headroom,
        Math.min(headroom, -distanceFromCentre * factor),
      );

      node.style.transform = `translate3d(0, ${offset.toFixed(2)}px, 0)`;
    };

    const onScroll = (): void => {
      if (frame) return;
      frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [factor, prefersReducedMotion, scale]);

  return ref;
}
