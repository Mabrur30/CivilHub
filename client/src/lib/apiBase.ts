/**
 * Where the API lives. Production builds must set VITE_API_URL (the build
 * fails without it, see vite.config.ts); in development it defaults to the
 * local server.
 */
export const API_BASE_URL = (
  import.meta.env.VITE_API_URL?.trim() || "http://localhost:5000"
).replace(/\/+$/, "");
