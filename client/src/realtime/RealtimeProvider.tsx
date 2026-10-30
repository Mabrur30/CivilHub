import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useContext } from "react";
import { useAuth } from "../context/AuthContext";
import { API_BASE_URL } from "../lib/apiBase";
import {
  type RealtimeEvent,
  type RealtimeScope,
  type RealtimeTopic,
} from "./realtime.types";
import {
  RealtimeContext,
  type RealtimeContextValue,
  type RealtimeListener,
} from "./realtimeContext";

interface RealtimeProviderProps {
  children: ReactNode;
}

const topics = new Set<RealtimeTopic>([
  "notifications",
  "conversations",
  "messages",
  "bids",
  "invitations",
  "projects",
  "project-progress",
  "dashboard",
  "network",
  "feed",
  "comments",
  "equipment-listings",
  "equipment-availability",
  "bookings",
  "reviews",
  "disputes",
  "marketplace",
]);

const isScope = (value: unknown): value is RealtimeScope => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((item) => typeof item === "string");
};

const isRealtimeEvent = (value: unknown): value is RealtimeEvent => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    Array.isArray(event.topics) &&
    event.topics.every(
      (topic): topic is RealtimeTopic =>
        typeof topic === "string" && topics.has(topic as RealtimeTopic),
    ) &&
    isScope(event.scope) &&
    typeof event.createdAt === "string"
  );
};

export function RealtimeProvider({
  children,
}: RealtimeProviderProps): ReactElement {
  const { currentUser } = useAuth();
  const listenersRef = useRef<Set<RealtimeListener>>(new Set());
  const currentUserId = currentUser?.id;
  const sourceRef = useRef<EventSource | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryDelayRef = useRef<number>(2_000);
  const generationRef = useRef<number>(0);
  const [connectionEpoch, setConnectionEpoch] = useState<number>(0);

  useEffect(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    retryDelayRef.current = 2_000;

    const clearRetry = (): void => {
      if (retryTimerRef.current !== null) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };

    const close = (): void => {
      clearRetry();
      const source = sourceRef.current;
      sourceRef.current = null;
      if (source) source.close();
    };

    const connect = (): void => {
      if (!currentUserId || generationRef.current !== generation) return;
      const existing = sourceRef.current;
      if (existing && existing.readyState !== EventSource.CLOSED) return;
      clearRetry();
      const source = new EventSource(
        `${API_BASE_URL}/api/realtime/stream`,
        { withCredentials: true },
      );
      sourceRef.current = source;
      source.onopen = (): void => {
        retryDelayRef.current = 2_000;
        setConnectionEpoch((epoch) => epoch + 1);
      };
      source.addEventListener("invalidate", (message: MessageEvent<string>) => {
        try {
          const parsed: unknown = JSON.parse(message.data);
          if (!isRealtimeEvent(parsed)) return;
          for (const listener of listenersRef.current) listener(parsed);
        } catch {
          // Invalid frames are ignored.
        }
      });
      source.onerror = (): void => {
        if (
          source.readyState !== EventSource.CLOSED ||
          !currentUserId ||
          generationRef.current !== generation
        ) {
          return;
        }
        source.close();
        sourceRef.current = null;
        const delay = retryDelayRef.current;
        retryDelayRef.current = Math.min(delay * 2, 60_000);
        retryTimerRef.current = window.setTimeout(connect, delay);
      };
    };

    close();
    if (currentUserId) connect();
    return close;
  }, [currentUserId]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      subscribe: (listener: RealtimeListener): (() => void) => {
        listenersRef.current.add(listener);
        return () => listenersRef.current.delete(listener);
      },
      connectionEpoch,
    }),
    [connectionEpoch],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtimeContext(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context) {
    throw new Error("useRealtimeContext must be used inside RealtimeProvider");
  }
  return context;
}
