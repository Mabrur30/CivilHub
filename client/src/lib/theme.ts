import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

// Read by the inline script in index.html too, so the saved theme is applied
// before first paint. Keep the two in step.
const STORAGE_KEY = "civilhub-theme";

const listeners = new Set<() => void>();

const readTheme = (): Theme =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

export const setTheme = (theme: Theme): void => {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private windows can refuse storage; the choice still holds for this visit.
  }
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Current theme, kept in sync across every toggle on the page. */
export const useTheme = (): Theme =>
  useSyncExternalStore(subscribe, readTheme, () => "dark");
