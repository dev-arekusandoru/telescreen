import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    // Dev-only. The deployed instance (docker compose) publishes 8788.
    port: 4001,
    proxy: {
      // The Hono server (`pnpm dev` at the repo root) listens on 4000.
      // Override with TELESCREEN_API_URL to point at another instance.
      "/api": process.env.TELESCREEN_API_URL ?? "http://127.0.0.1:4000",
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: { modules: { classNameStrategy: "non-scoped" } },
  },
});
