import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Its own port, so it runs beside the main site (5173) and the API (5000).
export default defineConfig(({ command, mode }) => {
  // A production build without the API address would quietly call localhost.
  if (command === "build" && mode === "production" && !loadEnv(mode, process.cwd(), "VITE_").VITE_API_URL?.trim()) {
    throw new Error("Set VITE_API_URL to the API's public address before building (see .env.example).");
  }
  return {
    plugins: [react(), tailwindcss()],
    server: { port: 5174, strictPort: true },
    preview: { port: 5174, strictPort: true },
  };
});
