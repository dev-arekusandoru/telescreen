import type { OpenAPIHono } from "@hono/zod-openapi";
import { createApp } from "../src/app.js";
import { createToken } from "../src/auth/tokens.js";
import type { AppEnv } from "../src/auth/middleware.js";
import { makeCtx, type Ctx } from "../src/context.js";
import { openDb, runMigrations, type Db } from "../src/db/client.js";
import { seedIfEmpty, type Household } from "../src/services/households.js";

/** Deterministic default clock for tests: 2026-11-03T12:00:00.000Z. */
export const FIXED_NOW = new Date("2026-11-03T12:00:00.000Z");

export interface TestContext {
  db: Db;
  ctx: Ctx;
  /** Seeded household (Alex + Vale). */
  household: Household;
  /** Plaintext bearer token for this household. */
  token: string;
}

export interface TestApp extends TestContext {
  app: OpenAPIHono<AppEnv>;
  request<T = unknown>(method: string, path: string, body?: unknown): Promise<{ status: number; body: T }>;
}

/** In-memory SQLite with migrations applied, the seeded household and one API token. */
export function makeTestCtx(): TestContext {
  const { db } = openDb(":memory:");
  runMigrations(db);
  const household = seedIfEmpty(db, { HOMEHUB_TIMEZONE: "Europe/Berlin" });
  const ctx = makeCtx(db, household.id, () => new Date(FIXED_NOW));
  const { token } = createToken(db, household.id, "test");
  return { db, ctx, household, token };
}

/** API app wired to a test context; `request` sends a bearer-authenticated JSON request. */
export function makeTestApp(options: { trustNetwork?: boolean } = {}): TestApp {
  const context = makeTestCtx();
  const app = createApp({ db: context.db, now: context.ctx.now, trustNetwork: options.trustNetwork === true });

  async function request<T = unknown>(method: string, path: string, body?: unknown) {
    const headers: Record<string, string> = { authorization: `Bearer ${context.token}` };
    if (body !== undefined) headers["content-type"] = "application/json";
    const response = await app.request(path, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let parsed: unknown = text;
    try {
      parsed = text === "" ? null : JSON.parse(text);
    } catch {
      parsed = text;
    }
    return { status: response.status, body: parsed as T };
  }

  return { ...context, app, request };
}
