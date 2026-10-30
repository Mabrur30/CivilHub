import { useEffect, useRef } from "react";
import { useRealtimeContext } from "./RealtimeProvider";
import {
  type RealtimeEvent,
  type RealtimeScope,
  type RealtimeTopic,
} from "./realtime.types";

interface RealtimeOptions {
  debounceMs?: number;
  minIntervalMs?: number;
  scopeMatch?: (scope: RealtimeScope) => boolean;
  enabled?: boolean;
}

export function useRealtime(
  topics: RealtimeTopic[],
  onInvalidate: (event: RealtimeEvent) => void,
  options?: RealtimeOptions,
): void {
  const { subscribe, connectionEpoch } = useRealtimeContext();
  const handlerRef = useRef(onInvalidate);
  const firstEpochRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const throttleTimerRef = useRef<number | null>(null);
  const lastRunRef = useRef<number | null>(null);
  const pendingRef = useRef<RealtimeEvent | null>(null);
  const staleRef = useRef<boolean>(false);
  const optionsRef = useRef(options);
  const topicsKey = topics.join("|");
  const topicsRef = useRef(topics);
  useEffect(() => {
    handlerRef.current = onInvalidate;
    optionsRef.current = options;
    topicsRef.current = topics;
  }, [onInvalidate, options, topicsKey]);

  useEffect(() => {
    const enabled = optionsRef.current?.enabled ?? true;
    if (!enabled) return;
    const topicSet = new Set(topicsRef.current);
    const matches = (event: RealtimeEvent): boolean =>
      event.topics.some((topic) => topicSet.has(topic)) &&
      (!optionsRef.current?.scopeMatch ||
        optionsRef.current.scopeMatch(event.scope));
    const run = (): void => {
      const pending = pendingRef.current;
      if (!pending) return;
      if (document.hidden) {
        staleRef.current = true;
        return;
      }
      const minIntervalMs = optionsRef.current?.minIntervalMs ?? 0;
      // With minIntervalMs=5000, a burst of ten events over two seconds
      // leaves one pending event and can produce at most the initial run plus
      // one trailing run.
      const remaining =
        lastRunRef.current === null
          ? 0
          : minIntervalMs - (Date.now() - lastRunRef.current);
      if (remaining > 0) {
        if (throttleTimerRef.current !== null) {
          window.clearTimeout(throttleTimerRef.current);
        }
        throttleTimerRef.current = window.setTimeout(run, remaining);
        return;
      }
      pendingRef.current = null;
      lastRunRef.current = Date.now();
      handlerRef.current(pending);
    };
    const schedule = (event: RealtimeEvent): void => {
      if (!matches(event)) return;
      pendingRef.current = event;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      if (throttleTimerRef.current !== null) {
        window.clearTimeout(throttleTimerRef.current);
      }
      if (lastRunRef.current !== null && (optionsRef.current?.minIntervalMs ?? 0) > 0) {
        throttleTimerRef.current = window.setTimeout(
          run,
          Math.max(0, (optionsRef.current?.minIntervalMs ?? 0) -
            (Date.now() - lastRunRef.current)),
        );
        return;
      }
      timerRef.current = window.setTimeout(
        run,
        optionsRef.current?.debounceMs ?? 400,
      );
    };
    const visible = (): void => {
      if (!document.hidden && staleRef.current) {
        staleRef.current = false;
        run();
      }
    };
    const unsubscribe = subscribe(schedule);
    document.addEventListener("visibilitychange", visible);
    return () => {
      unsubscribe();
      document.removeEventListener("visibilitychange", visible);
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      if (throttleTimerRef.current !== null) {
        window.clearTimeout(throttleTimerRef.current);
      }
      throttleTimerRef.current = null;
      pendingRef.current = null;
    };
  }, [subscribe, topicsKey, options?.enabled]);

  useEffect(() => {
    if (connectionEpoch === 0) return;
    if (firstEpochRef.current === null) {
      firstEpochRef.current = connectionEpoch;
      return;
    }
    if (options?.enabled === false) return;
    handlerRef.current({
      id: `connection-${connectionEpoch}`,
      topics: topicsRef.current,
      scope: {},
      createdAt: new Date().toISOString(),
    });
  }, [connectionEpoch, options?.enabled, topicsKey]);
}
