import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { dbPath, loadDotEnv, serverPort, trustNetwork } from "./config.js";
import { openDb, runMigrations } from "./db/client.js";
import { makeCtx } from "./context.js";
import { hasSecretKey } from "./lib/crypto.js";
import { seedIfEmpty } from "./services/households.js";
import { startSyncScheduler } from "./services/sync.js";
import { runChoreTick } from "./services/chores.js";
import { defaultWebDir, hasWebApp } from "./web.js";

loadDotEnv();

const hostname = process.env.HOST ?? "0.0.0.0";
const port = serverPort();
const trust = trustNetwork();
const webDir = defaultWebDir();
const serveWeb = hasWebApp(webDir);

const file = dbPath();
const { db, sqlite } = openDb(file);
runMigrations(db);
const household = seedIfEmpty(db);

const app = createApp({ db, trustNetwork: trust, ...(serveWeb ? { webDir } : {}) });

// Chores: expire missed occurrences and keep the next two weeks materialized (also done lazily per request).
const choreCtx = makeCtx(db, household.id);
const choreTick = (): void => {
  try {
    runChoreTick(choreCtx);
  } catch (error) {
    console.error("Chore tick failed:", error);
  }
};
choreTick();
const choreTimer = setInterval(choreTick, 15 * 60_000);
choreTimer.unref();

if (trust) {
  console.log("TELESCREEN_TRUST_NETWORK is on: /api/v1 requests without a token act as the household.");
}
if (!hasSecretKey()) {
  console.warn("TELESCREEN_SECRET_KEY is not set or invalid: connecting calendar accounts will fail until it is.");
}
console.log(
  serveWeb
    ? `Serving web app from ${webDir}`
    : `Web app not found at ${webDir}; serving the API only (build it with \`pnpm build\`).`,
);

const stopSync = startSyncScheduler(makeCtx(db, household.id));

const server = serve({ fetch: app.fetch, port, hostname }, (info) => {
  console.log(`Telescreen listening on http://${hostname}:${info.port} (${household.name}, ${household.timezone})`);
  console.log(`Database: ${file}`);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  stopSync();
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
