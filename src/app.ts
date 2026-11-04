import { OpenAPIHono, type Hook } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { createAuthMiddleware, type AppEnv } from "./auth/middleware.js";
import type { Db } from "./db/client.js";
import { isAppError } from "./lib/errors.js";
import { healthHandler, healthRoute, packageVersion } from "./routes/health.js";
import { mountGoogleCallback } from "./routes/googleCallback.js";
import { routeRegistrars } from "./routes/index.js";
import { createWebMiddleware } from "./web.js";

export type { AppEnv } from "./auth/middleware.js";

/** Fully configured Hono app (OpenAPI-aware). */
export type App = OpenAPIHono<AppEnv>;

export interface CreateAppOptions {
  db: Db;
  /** Clock used for request contexts (tests inject a fixed one). */
  now?: () => Date;
  /**
   * `HOMEHUB_TRUST_NETWORK=1`: `/api/v1` requests without an `Authorization`
   * header act as the household. A token that is sent is still verified. Default false.
   */
  trustNetwork?: boolean;
  /** Directory of the built web app to serve at `/` (SPA fallback). Omit to serve none. */
  webDir?: string;
}

/** Zod validation failures become `{ error: { code: "validation", … } }` with status 400. */
const defaultHook: Hook<unknown, AppEnv, string, void | Response> = (result, c) => {
  if (!result.success) {
    return c.json(
      {
        error: {
          code: "validation" as const,
          message: "Request validation failed",
          details: result.error.issues,
        },
      },
      400,
    );
  }
};

export function createApp(options: CreateAppOptions): App {
  const { db } = options;
  const now = options.now ?? (() => new Date());

  const app = new OpenAPIHono<AppEnv>({ defaultHook });

  app.onError((err, c) => {
    if (isAppError(err)) return c.json(err.toBody(), err.status as ContentfulStatusCode);
    if (err instanceof HTTPException) return err.getResponse();
    console.error("[homehub] unhandled error:", err);
    return c.json({ error: { code: "internal", message: "Internal server error" } }, 500);
  });

  const api = new OpenAPIHono<AppEnv>({ defaultHook });
  for (const register of routeRegistrars) register(api);

  // /api/v1/health is public; everything else needs a token (or network trust).
  const auth = createAuthMiddleware(db, now, { trustNetwork: options.trustNetwork === true });
  app.use("/api/v1/*", async (c, next) => {
    if (c.req.path === "/api/v1/health") return next();
    return auth(c, next);
  });
  app.route("/api/v1", api);
  mountGoogleCallback(app, { db, now });

  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "API token created with `pnpm cli token create <name>`.",
  });

  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "HomeHub",
      version: packageVersion(),
      description:
        "Self-hosted family wall-calendar and chores. /api/v1 routes need a bearer token unless the server runs with HOMEHUB_TRUST_NETWORK=1.",
    },
    tags: [
      { name: "meta", description: "Health and API metadata" },
      { name: "household", description: "The household" },
      { name: "members", description: "Household members" },
      { name: "settings", description: "Typed app settings" },
      { name: "chores", description: "Chore templates, occurrences and progress" },
      { name: "accounts", description: "Calendar accounts (Google, iCloud) and sync" },
      { name: "calendars", description: "Discovered calendars, member mapping" },
      { name: "events", description: "Expanded calendar events and writes" },
    ],
    security: [{ bearerAuth: [] }],
  });

  if (options.webDir !== undefined) app.use("*", createWebMiddleware(options.webDir));

  return app;
}
