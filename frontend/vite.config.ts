import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import fs from "node:fs";

/**
 * In the sandbox the Django backend runs on :8000; the Vite dev server
 * proxies /api and /media so the browser only ever talks to :3000.
 * In production, set VITE_API_BASE_URL to the backend origin instead.
 */

const BACKEND_ROOT = path.resolve(__dirname, "..", "backend");
const BACKEND_LOG = path.join(BACKEND_ROOT, "..", "backend_server.log");

let backendChild: ChildProcess | null = null;

async function startBackend(): Promise<void> {
  if (await portInUse(8000)) return; // already running (e.g. via start.sh)
  const python = fs.existsSync(path.join(BACKEND_ROOT, "venv/bin/python"))
    ? path.join(BACKEND_ROOT, "venv/bin/python")
    : "python3";
  const out = fs.openSync(BACKEND_LOG, "a");
  backendChild = spawn(
    python,
    ["manage.py", "runserver", "0.0.0.0:8000", "--noreload"],
    { cwd: BACKEND_ROOT, stdio: ["ignore", out, out], detached: false },
  );
  backendChild.on("exit", (code) => {
    fs.appendFileSync(
      BACKEND_LOG,
      `[vite] Django backend exited (code ${code})\n`,
    );
    backendChild = null;
  });
  fs.appendFileSync(BACKEND_LOG, "[vite] Django backend spawned by Vite\n");
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(400);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(port, "127.0.0.1");
  });
}

/**
 * Dev-only plugin: boot the Django API server as a child of the Vite dev
 * process (skipped when something already listens on :8000). This keeps a
 * single `bun run dev` / `npm run dev` as the one command that starts the
 * whole stack, and the API stays up for as long as the dev server runs.
 */
function djangoBackend(): Plugin {
  // Kill the child only when the dev process itself exits — NOT on Vite's
  // in-process config-reload restarts (those fire httpServer 'close' on the
  // old instance, which would kill a freshly spawned backend).
  const stopBackend = () => {
    if (backendChild) {
      backendChild.kill("SIGTERM");
      backendChild = null;
    }
  };

  return {
    name: "django-backend-dev",
    apply: "serve",
    configureServer() {
      void startBackend();
      process.once("exit", stopBackend);
      process.once("SIGINT", stopBackend);
      process.once("SIGTERM", stopBackend);
    },
  };
}

export default defineConfig({
  plugins: [react(), djangoBackend()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: 3000,
    host: "0.0.0.0",
    strictPort: true,
    // The sandbox preview proxies the app through dynamic gateway hostnames
    // (e.g. *.fcapp.run). Allow them all so Vite's host check never blocks
    // the preview. This is safe here: the dev server is only exposed inside
    // the sandbox network, never on the public internet.
    allowedHosts: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:8000", changeOrigin: true },
      "/media": { target: "http://127.0.0.1:8000", changeOrigin: true },
    },
  },
});
