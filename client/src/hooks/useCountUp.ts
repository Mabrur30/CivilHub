import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

const DURATION_MS = 1400;
const VALUE_PATTERN = /^([^\d]*)([\d,]*\.?\d+)(.*)$/;

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

/**
 * Animates a display string's numeric part from zero to its real value, keeping
 * whatever wraps it. "1,200+", "94%" and "28 days" all animate correctly without
 * their source data needing to be restructured into separate number/suffix fields.
 *
 * The real string is what renders whenever the animation is not running — while
 * inactive, under reduced motion, and on the final frame — so the displayed
 * figure is only ever an interpolation mid-count.
 */
export function useCountUp(displayValue: string, active: boolean): string {
  const prefersReducedMotion = usePrefersReducedMotion();
  const [frameValue, setFrameValue] = useState<string | null>(null);

  const shouldAnimate = active && !prefersReducedMotion;

  useEffect(() => {
    if (!shouldAnimate) return;

    const match = VALUE_PATTERN.exec(displayValue);
    if (!match) return;

    const [, prefix, rawNumber, suffix] = match;
    const target = Number(rawNumber.replace(/,/g, ""));
    if (!Number.isFinite(target)) return;

    const decimals = rawNumber.includes(".")
      ? rawNumber.split(".")[1].length
      : 0;

    const format = (value: number): string =>
      `${prefix}${value.toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`;

    let start: number | null = null;

    const tick = (now: number): void => {
      start ??= now;
      const progress = Math.min((now - start) / DURATION_MS, 1);

      if (progress === 1) {
        // Hand rendering back to the source string so rounding can never leave a
        // stat showing something other than its real value.
        setFrameValue(null);
        return;
      }

      setFrameValue(format(target * easeOutCubic(progress)));
      frame = requestAnimationFrame(tick);
    };

    let frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [displayValue, shouldAnimate]);

  return frameValue ?? displayValue;
}
