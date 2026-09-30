import { useEffect, useState } from "react";

const API_BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

/** The server's default (PLATFORM_COMMISSION_RATE), used if the rate can't be fetched. */
const DEFAULT_COMMISSION_RATE = 0.1;

let cached: Promise<number> | null = null;

const fetchCommissionRate = (): Promise<number> => {
  cached ??= fetch(`${API_BASE_URL}/api/public/platform`)
    .then((response) => (response.ok ? response.json() : null))
    .then((body: unknown) => {
      const rate = (body as { commissionRate?: unknown } | null)?.commissionRate;
      return typeof rate === "number" && rate >= 0 && rate <= 1 ? rate : DEFAULT_COMMISSION_RATE;
    })
    .catch(() => DEFAULT_COMMISSION_RATE);
  return cached;
};

/**
 * CivilHub's current commission, as an admin set it, for public pages. Null
 * until it has loaded; fetched once per page load and shared.
 */
export const useCommissionRate = (): number | null => {
  const [rate, setRate] = useState<number | null>(null);
  useEffect(() => {
    let isActive = true;
    void fetchCommissionRate().then((value) => {
      if (isActive) setRate(value);
    });
    return () => {
      isActive = false;
    };
  }, []);
  return rate;
};

/** 0.075 → "7.5%". */
export const formatRate = (rate: number): string => `${Math.round(rate * 1000) / 10}%`;
