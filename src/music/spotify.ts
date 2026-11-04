import { createHash, randomBytes } from "node:crypto";

/**
 * Spotify Web API client (SPEC §6, Music module).
 *
 * OAuth is Authorization Code **with PKCE** (`SPOTIFY_CLIENT_ID`, optional
 * `SPOTIFY_CLIENT_SECRET`), server-side. Spotify returns both an access token
 * (1 h) and a refresh token; HomeHub stores the refresh token encrypted and
 * refreshes access tokens on the server, so the browser never sees a token.
 *
 * Also supports the 127.0.0.1 fallback redirect (see README "Spotify").
 */

export const SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize";
export const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
export const SPOTIFY_API = "https://api.spotify.com/v1";

/** Playback state read + transport control on an existing device (Premium). */
export const SPOTIFY_SCOPES = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
] as const;

export interface SpotifyConfig {
  clientId: string;
  /** Optional: the PKCE flow does not need it, but a Web-app client has one. */
  clientSecret: string | null;
  redirectUri: string;
}

/** Spotify settings from the environment, or null when `SPOTIFY_CLIENT_ID` is unset. */
export function spotifyConfig(env: NodeJS.ProcessEnv = process.env): SpotifyConfig | null {
  const clientId = env.SPOTIFY_CLIENT_ID?.trim();
  if (!clientId) return null;
  const publicUrl = (env.HOMEHUB_PUBLIC_URL?.trim() || "http://localhost:8788").replace(/\/+$/, "");
  const redirectUri = env.SPOTIFY_REDIRECT_URI?.trim() || `${publicUrl}/auth/spotify/callback`;
  return { clientId, clientSecret: env.SPOTIFY_CLIENT_SECRET?.trim() || null, redirectUri };
}

// -- PKCE ---------------------------------------------------------------------

const VERIFIER_ALPHABET = /^[A-Za-z0-9\-._~]{43,128}$/;

/** True for a spec-compliant PKCE `code_verifier` (43–128 chars of `A-Za-z0-9-._~`). */
export function isValidCodeVerifier(verifier: string): boolean {
  return VERIFIER_ALPHABET.test(verifier);
}

/**
 * Random `code_verifier`. 48 random bytes → 64 base64url characters, so the
 * result is always inside the allowed alphabet and length.
 */
export function createCodeVerifier(bytes = 48): string {
  return randomBytes(bytes).toString("base64url");
}

/** `code_challenge` = base64url(SHA-256(verifier)), i.e. `S256`. */
export function codeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = createCodeVerifier();
  return { verifier, challenge: codeChallenge(verifier) };
}

// -- Errors -------------------------------------------------------------------

/** Bad request/response from Spotify (mapped to 502 by the API layer). */
export class SpotifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpotifyError";
  }
}

/** Spotify rejected the stored credentials: the connection must be recreated. */
export class SpotifyAuthError extends SpotifyError {
  constructor(message = "Spotify rejected the stored credentials. Reconnect Spotify in Settings.") {
    super(message);
    this.name = "SpotifyAuthError";
  }
}

/** Transport commands need an app playing on some device. */
export class SpotifyNoActiveDeviceError extends SpotifyError {
  constructor(message = "No active Spotify device. Start playback in the Spotify app first.") {
    super(message);
    this.name = "SpotifyNoActiveDeviceError";
  }
}

/** Account is not Premium, so playback cannot be controlled. */
export class SpotifyPremiumRequiredError extends SpotifyError {
  constructor(message = "Spotify Premium is required to control playback.") {
    super(message);
    this.name = "SpotifyPremiumRequiredError";
  }
}

/** 429: the caller should wait `retryAfterSeconds` before trying again. */
export class SpotifyRateLimitError extends SpotifyError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Spotify is rate limiting requests; retry in ${retryAfterSeconds}s.`);
    this.name = "SpotifyRateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// -- Tokens -------------------------------------------------------------------

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Absolute ISO instant at which `accessToken` is no longer usable. */
  expiresAt: string;
}

export interface SpotifySecret {
  refreshToken: string;
  accessToken?: string;
  expiresAt?: string;
}

export interface SpotifyDeps {
  fetch: typeof fetch;
  now: () => Date;
}

const defaultDeps = (): SpotifyDeps => ({
  // Wrapped (not a snapshot) so tests can stub `globalThis.fetch` after import.
  fetch: (input, init) => globalThis.fetch(input, init),
  now: () => new Date(),
});

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function postToken(
  config: SpotifyConfig,
  fields: Record<string, string>,
  deps: SpotifyDeps,
): Promise<SpotifyTokens> {
  const body = new URLSearchParams({ ...fields, client_id: config.clientId });
  // A Web-app client id also has a secret; PKCE works with or without it.
  if (config.clientSecret) body.set("client_secret", config.clientSecret);
  let res: Response;
  try {
    res = await deps.fetch(SPOTIFY_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (cause) {
    throw new SpotifyError("Could not reach Spotify. Check the server's network connection.");
  }
  const json = (await res.json().catch(() => ({}))) as RawTokenResponse;
  if (!res.ok || !json.access_token) {
    const detail = json.error_description ?? json.error ?? `HTTP ${res.status}`;
    if (res.status === 400 && json.error === "invalid_grant") {
      throw new SpotifyAuthError(`Spotify rejected the authorization: ${detail}. Start the connection again.`);
    }
    if (res.status === 401 || res.status === 403) throw new SpotifyAuthError(`Spotify refused the token request: ${detail}`);
    throw new SpotifyError(`Spotify token request failed: ${detail}`);
  }
  // Spotify sends expires_in = 3600; be conservative if it is missing.
  const expiresIn = json.expires_in ?? 3600;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? null,
    expiresAt: new Date(deps.now().getTime() + expiresIn * 1000).toISOString(),
  };
}

/** Authorization-code → tokens. PKCE: the verifier is checked server-side by Spotify. */
export async function exchangeSpotifyCode(
  config: SpotifyConfig,
  code: string,
  codeVerifier: string,
  deps: SpotifyDeps = defaultDeps(),
): Promise<SpotifyTokens> {
  return postToken(
    config,
    { grant_type: "authorization_code", code, redirect_uri: config.redirectUri, code_verifier: codeVerifier },
    deps,
  );
}

/** Refresh-token → a new access token. Spotify may rotate the refresh token. */
export async function refreshSpotifyToken(
  config: SpotifyConfig,
  refreshToken: string,
  deps: SpotifyDeps = defaultDeps(),
): Promise<SpotifyTokens> {
  return postToken(config, { grant_type: "refresh_token", refresh_token: refreshToken }, deps);
}

// -- Playback shapes ----------------------------------------------------------

export interface PlaybackDevice {
  /** null for restricted devices (Spotify groups); they cannot receive playback. */
  id: string | null;
  name: string;
  type: string;
  volumePercent: number | null;
  isActive: boolean;
}

export interface PlaybackTrack {
  id: string | null;
  title: string;
  artists: string[];
  album: string | null;
  albumArtUrl: string | null;
  durationMs: number;
  progressMs: number;
  isPlaying: boolean;
}

export interface PlaybackState {
  track: PlaybackTrack | null;
  device: PlaybackDevice | null;
}

interface RawImage {
  url: string;
  width?: number | null;
  height?: number | null;
}

interface RawDevice {
  id?: string | null;
  name?: string;
  type?: string;
  volume_percent?: number | null;
  is_active?: boolean;
}

interface RawItem {
  id?: string | null;
  name?: string;
  duration_ms?: number;
  artists?: Array<{ name?: string }>;
  album?: { name?: string; images?: RawImage[] };
  show?: { name?: string; images?: RawImage[] };
  images?: RawImage[];
}

interface RawPlayer {
  device?: RawDevice;
  is_playing?: boolean;
  progress_ms?: number | null;
  currently_playing_type?: string;
  item?: RawItem | null;
}

/** Largest image URL (Spotify lists 640/300/64 px, so take the widest). */
function largestImage(images: RawImage[] | undefined): string | null {
  if (!images || images.length === 0) return null;
  let best = images[0]!;
  for (const image of images) if ((image.width ?? 0) > (best.width ?? 0)) best = image;
  return best.url;
}

function toDevice(raw: RawDevice | undefined): PlaybackDevice | null {
  if (!raw) return null;
  return {
    id: raw.id ?? null,
    name: raw.name ?? "Unknown device",
    type: raw.type ?? "Unknown",
    volumePercent: typeof raw.volume_percent === "number" ? raw.volume_percent : null,
    isActive: raw.is_active === true,
  };
}

function toTrack(raw: RawPlayer, item: RawItem): PlaybackTrack {
  const artists = (item.artists ?? []).map((a) => a.name).filter((n): n is string => typeof n === "string");
  const show = item.show?.name;
  return {
    id: item.id ?? null,
    title: item.name ?? "Unknown track",
    artists: artists.length > 0 ? artists : show ? [show] : [],
    album: item.album?.name ?? show ?? null,
    albumArtUrl: largestImage(item.album?.images ?? item.images ?? item.show?.images),
    durationMs: item.duration_ms ?? 0,
    progressMs: raw.progress_ms ?? 0,
    isPlaying: raw.is_playing === true,
  };
}

function toPlaybackState(raw: RawPlayer): PlaybackState {
  const item = raw.item ?? null;
  return {
    track: item ? toTrack(raw, item) : null,
    device: toDevice(raw.device),
  };
}

// -- Client -------------------------------------------------------------------

const EXPIRY_SKEW_MS = 30_000;

interface RequestOptions {
  query?: Record<string, string | number>;
  body?: unknown;
}

function errorMessageFrom(body: unknown, fallback: string): string {
  if (typeof body !== "object" || body === null || !("error" in body)) return fallback;
  const error = body.error;
  if (typeof error === "string") {
    const description = "error_description" in body ? body.error_description : undefined;
    return typeof description === "string" ? `${error}: ${description}` : error;
  }
  if (typeof error === "object" && error !== null && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function errorReasonFrom(body: unknown): string | null {
  if (typeof body !== "object" || body === null || !("error" in body)) return null;
  const error = body.error;
  if (typeof error !== "object" || error === null || !("reason" in error)) return null;
  return typeof error.reason === "string" ? error.reason : null;
}

/** Effective `Retry-After` in whole seconds (Spotify sends an integer). */
function retryAfterSeconds(res: Response): number {
  const raw = res.headers.get("retry-after");
  const parsed = raw === null ? NaN : Number(raw);
  if (Number.isFinite(parsed) && parsed >= 0) return Math.max(1, Math.ceil(parsed));
  return 1;
}

/**
 * Thin Spotify Web API client for one connection. Holds the decrypted secret
 * in memory and refreshes the access token when it is expired or rejected
 * (including one retry when a request gets 401).
 */
export class SpotifyClient {
  /** Current tokens; the caller persists this when it differs from what it loaded. */
  secret: SpotifySecret;
  private readonly deps: SpotifyDeps;

  constructor(
    secret: SpotifySecret,
    private readonly config: SpotifyConfig,
    deps: Partial<SpotifyDeps> = {},
  ) {
    this.secret = { ...secret };
    const defaults = defaultDeps();
    this.deps = { fetch: deps.fetch ?? defaults.fetch, now: deps.now ?? defaults.now };
  }

  private tokenValid(): boolean {
    if (!this.secret.accessToken || !this.secret.expiresAt) return false;
    const expiresAt = Date.parse(this.secret.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt - EXPIRY_SKEW_MS > this.deps.now().getTime();
  }

  /** Access token, refreshing (and keeping `secret` current) when needed. */
  async accessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh && this.tokenValid()) return this.secret.accessToken!;
    const tokens = await refreshSpotifyToken(this.config, this.secret.refreshToken, this.deps);
    this.secret = {
      refreshToken: tokens.refreshToken ?? this.secret.refreshToken,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    };
    return tokens.accessToken;
  }

  /** Authenticated request; returns the parsed body, or null for 204. */
  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T | null> {
    const url = new URL(`${SPOTIFY_API}${path}`);
    for (const [key, value] of Object.entries(options.query ?? {})) url.searchParams.set(key, String(value));
    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers["content-type"] = "application/json";

    let refreshed = false;
    for (;;) {
      const token = await this.accessToken(refreshed);
      let res: Response;
      try {
        res = await this.deps.fetch(url, {
          method,
          headers: { ...headers, authorization: `Bearer ${token}` },
          ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
        });
      } catch {
        throw new SpotifyError("Could not reach Spotify. Check the server's network connection.");
      }

      if (res.status === 401 && !refreshed) {
        // Token revoked or expired early: refresh once, then retry the request.
        refreshed = true;
        continue;
      }
      if (res.status === 429) throw new SpotifyRateLimitError(retryAfterSeconds(res));

      const text = await res.text();
      let body: unknown = null;
      if (text !== "") {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }

      if (res.ok) return (body as T) ?? null;
      if (res.status === 401) throw new SpotifyAuthError();
      const message = errorMessageFrom(body, `Spotify request failed (HTTP ${res.status})`);
      const reason = errorReasonFrom(body);
      // 404 from a player command or GET /me/player means nothing is active.
      if (res.status === 404 && (reason === "NO_ACTIVE_DEVICE" || /no active device/i.test(message))) {
        throw new SpotifyNoActiveDeviceError(message);
      }
      if (res.status === 403 && (reason === "PREMIUM_REQUIRED" || /premium/i.test(message))) {
        throw new SpotifyPremiumRequiredError(message);
      }
      throw new SpotifyError(message);
    }
  }

  /** Current playback, or null when no device is active. */
  async nowPlaying(): Promise<PlaybackState | null> {
    const raw = await this.request<RawPlayer>("GET", "/me/player");
    return raw === null ? null : toPlaybackState(raw);
  }

  async devices(): Promise<PlaybackDevice[]> {
    const raw = await this.request<{ devices?: RawDevice[] }>("GET", "/me/player/devices");
    return (raw?.devices ?? []).map((d) => toDevice(d)).filter((d): d is PlaybackDevice => d !== null);
  }

  async play(): Promise<void> {
    await this.request("PUT", "/me/player/play");
  }

  async pause(): Promise<void> {
    await this.request("PUT", "/me/player/pause");
  }

  async next(): Promise<void> {
    await this.request("POST", "/me/player/next");
  }

  async previous(): Promise<void> {
    await this.request("POST", "/me/player/previous");
  }

  async setVolume(percent: number): Promise<void> {
    await this.request("PUT", "/me/player/volume", { query: { volume_percent: percent } });
  }

  /** Move playback to `deviceId` and start it there. */
  async transfer(deviceId: string): Promise<void> {
    await this.request("PUT", "/me/player", { body: { device_ids: [deviceId], play: true } });
  }
}

/** Spotify display name, for the Settings label. Never fatal. */
export async function fetchSpotifyDisplayName(client: SpotifyClient): Promise<string | null> {
  try {
    const me = await client.request<{ display_name?: string | null; id?: string }>("GET", "/me");
    return me?.display_name?.trim() || me?.id || null;
  } catch {
    return null;
  }
}
