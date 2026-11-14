import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../auth/middleware.js";
import { makeCtx } from "../context.js";
import type { Db } from "../db/client.js";
import { households } from "../db/schema.js";
import { isAppError } from "../lib/errors.js";
import { completeSpotifyAuth } from "../services/music.js";
import { oauthPage } from "./oauthPage.js";

/**
 * Server-rendered OAuth redirect target for Spotify (not part of the OpenAPI client).
 * Browsers arriving here carry no bearer token; the single-use `state` nonce issued by
 * `POST /music/connect/start` (paired with its PKCE verifier) is the proof.
 */
export function mountSpotifyCallback(app: OpenAPIHono<AppEnv>, deps: { db: Db; now: () => Date }): void {
  app.get("/auth/spotify/callback", async (c) => {
    const error = c.req.query("error");
    if (error) return c.html(oauthPage("Spotify sign-in was cancelled", error), 400);
    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) {
      return c.html(oauthPage("Missing parameters", "Spotify did not send an authorization code."), 400);
    }
    const household = deps.db.select().from(households).limit(1).get();
    if (!household) return c.html(oauthPage("Not set up", "No household exists yet."), 500);
    const ctx = makeCtx(deps.db, household.id, deps.now);
    try {
      await completeSpotifyAuth(ctx, code, state);
      return c.redirect("/settings", 302);
    } catch (e) {
      const message = isAppError(e) ? e.message : "Could not finish connecting Spotify.";
      if (!isAppError(e)) console.error("[telescreen] spotify callback failed:", e);
      return c.html(oauthPage("Could not connect Spotify", message), isAppError(e) ? (e.status === 400 ? 400 : 502) : 500);
    }
  });
}
