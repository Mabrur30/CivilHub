import { createContext } from "react";
import type { RealtimeEvent } from "./realtime.types";

export type RealtimeListener = (event: RealtimeEvent) => void;

export interface RealtimeContextValue {
  subscribe: (listener: RealtimeListener) => () => void;
  connectionEpoch: number;
}

export const RealtimeContext = createContext<
  RealtimeContextValue | undefined
>(undefined);
