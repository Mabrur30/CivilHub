import { useEffect, useRef } from "react";
import { useRealtimeContext } from "./RealtimeProvider";
import {
  type RealtimeEvent,
  type RealtimeScope,
  type RealtimeTopic,
} from "./realtime.types";

interface RealtimeOptions {
  debounceMs?: number;
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
  const pendingRef = useRef<RealtimeEvent | null>(null);
  const staleRef = useRef<boolean>(false);
  const optionsRef = useRef(options);
  useEffect(() => {
    handlerRef.current = onInvalidate;
    optionsRef.current = options;
  }, [onInvalidate, options]);

  useEffect(() => {
    const enabled = optionsRef.current?.enabled ?? true;
    if (!enabled) return;
    const topicSet = new Set(topics);
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
      pendingRef.current = null;
      handlerRef.current(pending);
    };
    const schedule = (event: RealtimeEvent): void => {
      if (!matches(event)) return;
      pendingRef.current = event;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
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
      pendingRef.current = null;
    };
  }, [subscribe, topics.join("|"), options?.enabled]);

  useEffect(() => {
    if (connectionEpoch === 0) return;
    if (firstEpochRef.current === null) {
      firstEpochRef.current = connectionEpoch;
      return;
    }
    if (options?.enabled === false) return;
    handlerRef.current({
      id: `connection-${connectionEpoch}`,
      topics,
      scope: {},
      createdAt: new Date().toISOString(),
    });
  }, [connectionEpoch, options?.enabled, topics.join("|")]);
}
