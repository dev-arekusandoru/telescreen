import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Ctx } from "../context.js";
import type { Db } from "../db/client.js";
import { musicConnections } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { newId } from "../lib/ids.js";
import {
  SPOTIFY_AUTH_URL,
  SPOTIFY_SCOPES,
  SpotifyAuthError,
  SpotifyClient,
  SpotifyError,
  SpotifyNoActiveDeviceError,
  SpotifyPremiumRequiredError,
  SpotifyRateLimitError,
  SpotifyScopeError,
  createPkcePair,
  exchangeSpotifyCode,
  fetchSpotifyDisplayName,
  spotifyConfig,
  type SpotifySecret,
} from "../music/spotify.js";

type ConnectionRow = typeof musicConnections.$inferSelect;

export interface MusicConnectionView {
  connected: boolean;
  configured: boolean;
  label: string | null;
  status: "ok" | "error" | "needs_auth" | null;
  lastError: string | null;
}

const STATE_TTL_MS = 10 * 60_000;

/** In-flight PKCE authorizations: `state` → verifier + expiry. Single-process, like Google's. */
const pendingStates = new Map<string, { verifier: string; expiresAt: number }>();

function firstConnection(db: Db): ConnectionRow | undefined {
  return db.select().from(musicConnections).all()[0];
}

/** Connection status for Settings and the card. Never includes credentials. */
export function getMusicConnection(ctx: Ctx): MusicConnectionView {
  const row = firstConnection(ctx.db);
  const configured = spotifyConfig() !== null;
  if (!row) return { connected: false, configured, label: null, status: null, lastError: null };
  return {
    connected: true,
    configured,
    label: row.label,
    status: row.status === "disabled" ? "error" : row.status,
    lastError: row.lastError,
  };
}

/** Translate Spotify failures into API errors with a stable `details.reason`. */
export function mapSpotifyError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof SpotifyNoActiveDeviceError) {
    return new AppError("unprocessable", error.message, { reason: "no_active_device" });
  }
  if (error instanceof SpotifyPremiumRequiredError) {
    return new AppError("forbidden", error.message, { reason: "premium_required" });
  }
  if (error instanceof SpotifyScopeError) {
    return new AppError("unprocessable", error.message, { reason: "missing_scope" });
  }
  if (error instanceof SpotifyAuthError) {
    return new AppError("unprocessable", error.message, { reason: "needs_reconnect" });
  }
  if (error instanceof SpotifyRateLimitError) {
    return new AppError("unavailable", error.message, {
      reason: "rate_limited",
      retryAfterSeconds: error.retryAfterSeconds,
    });
  }
  if (error instanceof SpotifyError) {
    return new AppError("provider_error", error.message, { reason: "provider_error" });
  }
  return new AppError("provider_error", error instanceof Error ? error.message : "Spotify request failed", {
    reason: "provider_error",
  });
}

/**
 * Run `fn` against the connected Spotify client. Refreshed tokens are persisted,
 * and a rejected connection is flagged `needs_auth` for Settings.
 */
export async function withSpotify<T>(ctx: Ctx, fn: (client: SpotifyClient) => Promise<T>): Promise<T> {
  const config = spotifyConfig();
  if (!config) {
    throw new AppError(
      "unprocessable",
      "Spotify is not configured. Set SPOTIFY_CLIENT_ID and restart Telescreen (see the documentation).",
      { reason: "not_configured" },
    );
  }
  const row = firstConnection(ctx.db);
  if (!row) {
    throw new AppError("unprocessable", "Spotify is not connected. Connect it in Settings > Music.", {
      reason: "not_connected",
    });
  }

  const secret = JSON.parse(decryptSecret(row.secretEncrypted)) as SpotifySecret;
  const client = new SpotifyClient(secret, config, { now: ctx.now });

  let failure: unknown = null;
  try {
    return await fn(client);
  } catch (error) {
    failure = error;
    throw mapSpotifyError(error);
  } finally {
    const tokensChanged =
      client.secret.accessToken !== secret.accessToken || client.secret.refreshToken !== secret.refreshToken;
    const patch: Partial<ConnectionRow> = {};
    if (tokensChanged) patch.secretEncrypted = encryptSecret(JSON.stringify(client.secret));
    if (failure instanceof SpotifyAuthError) {
      patch.status = "needs_auth";
      patch.lastError = failure.message;
    } else if (failure === null && (tokensChanged || row.status !== "ok")) {
      patch.status = "ok";
      patch.lastError = null;
    }
    if (Object.keys(patch).length > 0) {
      ctx.db.update(musicConnections).set(patch).where(eq(musicConnections.id, row.id)).run();
    }
  }
}

/** Consent URL. The single-use `state` nonce (with the PKCE verifier) is checked in the callback. */
export function startSpotifyAuth(ctx: Ctx): { authUrl: string } {
  const config = spotifyConfig();
  if (!config) {
    throw new AppError(
      "unprocessable",
      "Spotify is not configured. Set SPOTIFY_CLIENT_ID and restart Telescreen (see the documentation).",
      { reason: "not_configured" },
    );
  }
  const nowMs = ctx.now().getTime();
  for (const [state, pending] of pendingStates) if (pending.expiresAt < nowMs) pendingStates.delete(state);

  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(24).toString("base64url");
  pendingStates.set(state, { verifier, expiresAt: nowMs + STATE_TTL_MS });

  const url = new URL(SPOTIFY_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope: SPOTIFY_SCOPES.join(" "),
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
    // Always show the consent screen so a wrong account can be swapped.
    show_dialog: "true",
  }).toString();
  return { authUrl: url.toString() };
}

/** Finish the OAuth flow: validate state, exchange the code with the verifier, store tokens encrypted. */
export async function completeSpotifyAuth(ctx: Ctx, code: string, state: string): Promise<MusicConnectionView> {
  const pending = pendingStates.get(state);
  pendingStates.delete(state);
  if (!pending || pending.expiresAt < ctx.now().getTime()) {
    throw new AppError("validation", "This Spotify sign-in link expired. Start again from Settings.");
  }
  const config = spotifyConfig();
  if (!config) throw new AppError("unprocessable", "Spotify is not configured");

  let tokens;
  try {
    tokens = await exchangeSpotifyCode(config, code, pending.verifier);
  } catch (error) {
    throw mapSpotifyError(error);
  }
  if (!tokens.refreshToken) {
    throw new AppError(
      "provider_error",
      "Spotify did not return a refresh token. Remove Telescreen from your Spotify account's apps and connect again.",
      { reason: "provider_error" },
    );
  }

  const secret: SpotifySecret = {
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    expiresAt: tokens.expiresAt,
  };
  const label = (await fetchSpotifyDisplayName(new SpotifyClient(secret, config, { now: ctx.now }))) ?? "Spotify";

  const encrypted = encryptSecret(JSON.stringify(secret));
  // One connection at a time: update the existing row instead of stacking accounts.
  const updated = ctx.db
    .update(musicConnections)
    .set({ label, secretEncrypted: encrypted, status: "ok", lastError: null })
    .run();
  if (updated.changes === 0) {
    ctx.db
      .insert(musicConnections)
      .values({ id: newId("mus"), provider: "spotify", label, secretEncrypted: encrypted, status: "ok", lastError: null })
      .run();
  }
  return getMusicConnection(ctx);
}

/** Forget the connection. Nothing changes in the Spotify account. */
export function disconnectMusic(db: Db): void {
  db.delete(musicConnections).run();
}
