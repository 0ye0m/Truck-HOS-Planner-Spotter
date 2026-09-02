import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// In the sandbox the Django backend runs on :8000; the Vite dev server
// proxies /api and /media so the browser only ever talks to :3000.
// In production, set VITE_API_BASE_URL to the backend origin instead.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/media": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
