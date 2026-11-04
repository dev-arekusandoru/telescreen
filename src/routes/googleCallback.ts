import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../auth/middleware.js";
import { makeCtx } from "../context.js";
import type { Db } from "../db/client.js";
import { households } from "../db/schema.js";
import { isAppError } from "../lib/errors.js";
import { completeGoogleAuth } from "../services/accounts.js";
import { syncAccount } from "../services/sync.js";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function page(title: string, detail: string): string {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>HomeHub</title>
<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;line-height:1.5">
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(detail)}</p><p><a href="/settings">Back to Settings</a></p>`;
}

/**
 * Server-rendered OAuth redirect target (not part of the OpenAPI client). Browsers arriving here
 * carry no bearer token; the single-use `state` nonce issued by `POST /accounts/google/start` is the proof.
 */
export function mountGoogleCallback(app: OpenAPIHono<AppEnv>, deps: { db: Db; now: () => Date }): void {
  app.get("/auth/google/callback", async (c) => {
    const error = c.req.query("error");
    if (error) return c.html(page("Google sign-in was cancelled", error), 400);
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) return c.html(page("Missing parameters", "Google did not send an authorization code."), 400);
    const household = deps.db.select().from(households).limit(1).get();
    if (!household) return c.html(page("Not set up", "No household exists yet."), 500);
    const ctx = makeCtx(deps.db, household.id, deps.now);
    try {
      const account = await completeGoogleAuth(ctx, code, state);
      void syncAccount(ctx, account.id);
      return c.redirect("/settings", 302);
    } catch (e) {
      const message = isAppError(e) ? e.message : "Could not finish connecting Google.";
      if (!isAppError(e)) console.error("[homehub] google callback failed:", e);
      return c.html(page("Could not connect Google", message), isAppError(e) ? e.status === 400 ? 400 : 502 : 500);
    }
  });
}
