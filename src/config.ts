import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Load `.env` from the working directory if present, so `pnpm dev` / `pnpm start` need no shell setup.
 * Variables already in the environment win (docker compose passes them via `env_file`).
 */
export function loadDotEnv(file = ".env"): void {
  if (!existsSync(file)) return;
  try {
    process.loadEnvFile(file);
  } catch (error) {
    console.warn(`Could not read ${file}:`, error instanceof Error ? error.message : error);
  }
}

/** Directory holding the SQLite file (and anything else persistent). `TELESCREEN_DATA_DIR`, default `./data`. */
export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.resolve(env.TELESCREEN_DATA_DIR?.trim() || "./data");
}

export function dbPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(dataDir(env), "telescreen.db");
}

/** Local dev port; docker compose pins `PORT=8788` for the deployed instance. */
export const DEFAULT_PORT = 4000;

/** Port the HTTP server listens on. `PORT`, default `DEFAULT_PORT`. */
export function serverPort(env: NodeJS.ProcessEnv = process.env): number {
  const parsed = Number.parseInt(env.PORT ?? "", 10);
  return Number.isFinite(parsed) ? parsed : DEFAULT_PORT;
}

/** Base URL used for OAuth redirects when `TELESCREEN_PUBLIC_URL` is unset. */
export function localPublicUrl(env: NodeJS.ProcessEnv = process.env): string {
  return `http://localhost:${serverPort(env)}`;
}

/** `TELESCREEN_TRUST_NETWORK=1|true`. */
export function trustNetwork(env: NodeJS.ProcessEnv = process.env): boolean {
  return ["1", "true"].includes(env.TELESCREEN_TRUST_NETWORK?.trim().toLowerCase() ?? "");
}
