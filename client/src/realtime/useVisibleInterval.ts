import { useEffect, useRef } from "react";

export function useVisibleInterval(
  fn: () => void,
  ms: number,
  enabled: boolean = true,
): void {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled) return;
    let intervalId: number | null = null;
    const stop = (): void => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
    const start = (): void => {
      stop();
      if (!document.hidden) {
        intervalId = window.setInterval(() => fnRef.current(), ms);
      }
    };
    const visibilityChanged = (): void => {
      if (document.hidden) stop();
      else start();
    };
    start();
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [enabled, ms]);
}
