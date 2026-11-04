import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { dbPath, trustNetwork } from "./config.js";
import { openDb, runMigrations } from "./db/client.js";
import { hasSecretKey } from "./lib/crypto.js";
import { seedIfEmpty } from "./services/households.js";
import { defaultWebDir, hasWebApp } from "./web.js";

const DEFAULT_PORT = 8788;

const hostname = process.env.HOST ?? "0.0.0.0";
const parsedPort = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
const port = Number.isFinite(parsedPort) ? parsedPort : DEFAULT_PORT;
const trust = trustNetwork();
const webDir = defaultWebDir();
const serveWeb = hasWebApp(webDir);

const file = dbPath();
const { db, sqlite } = openDb(file);
runMigrations(db);
const household = seedIfEmpty(db);

const app = createApp({ db, trustNetwork: trust, ...(serveWeb ? { webDir } : {}) });

if (trust) {
  console.log("HOMEHUB_TRUST_NETWORK is on: /api/v1 requests without a token act as the household.");
}
if (!hasSecretKey()) {
  console.warn("HOMEHUB_SECRET_KEY is not set or invalid: connecting calendar accounts will fail until it is.");
}
console.log(
  serveWeb
    ? `Serving web app from ${webDir}`
    : `Web app not found at ${webDir}; serving the API only (build it with \`pnpm build\`).`,
);

const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`HomeHub listening on http://${hostname}:${info.port} (${household.name}, ${household.timezone})`);
  console.log(`Database: ${file}`);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}, shutting down…`);
  const force = setTimeout(() => {
    console.error("Shutdown timed out; exiting.");
    process.exit(1);
  }, 10_000);
  force.unref();

  server.close((error) => {
    try {
      if (error) console.error("Error closing HTTP server:", error);
      sqlite.close();
    } finally {
      process.exit(error ? 1 : 0);
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
