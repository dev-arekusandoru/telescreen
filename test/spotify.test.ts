import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  SpotifyAuthError,
  SpotifyClient,
  SpotifyError,
  SpotifyNoActiveDeviceError,
  SpotifyPremiumRequiredError,
  SpotifyRateLimitError,
  codeChallenge,
  createCodeVerifier,
  createPkcePair,
  exchangeSpotifyCode,
  isValidCodeVerifier,
  refreshSpotifyToken,
  spotifyConfig,
  type SpotifyConfig,
} from "../src/music/spotify.js";
import { mapSpotifyError } from "../src/services/music.js";
import { AppError } from "../src/lib/errors.js";

const CONFIG: SpotifyConfig = {
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://hub.example.ts.net/auth/spotify/callback",
};

const NOW = new Date("2026-11-04T10:00:00.000Z");
const FUTURE = "2026-11-04T11:00:00.000Z";

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

/** Stub `globalThis.fetch` with a router; returns the request log. */
function stubFetch(route: (url: URL, init: RequestInit | undefined) => Reply) {
  const log: Array<{ url: URL; method: string; headers: Headers; body: string }> = [];
  const fn = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = typeof init?.body === "string" ? init.body : (init?.body?.toString() ?? "");
    log.push({ url, method: (init?.method ?? "GET").toUpperCase(), headers: new Headers(init?.headers), body });
    const reply = route(url, init);
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { "content-type": "application/json", ...reply.headers },
    });
  });
  return { fn: fn as unknown as typeof fetch, log };
}

describe("PKCE", () => {
  it("generates verifiers inside the RFC 7636 charset and length", () => {
    for (let i = 0; i < 5; i++) {
      const verifier = createCodeVerifier();
      expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/);
      expect(isValidCodeVerifier(verifier)).toBe(true);
    }
    expect(isValidCodeVerifier("short")).toBe(false);
    expect(isValidCodeVerifier("a".repeat(129))).toBe(false);
    expect(isValidCodeVerifier(`${"a".repeat(42)}+`)).toBe(false);
  });

  it("derives the S256 challenge and a fresh pair each time", () => {
    const verifier = "a".repeat(64);
    expect(codeChallenge(verifier)).toBe(createHash("sha256").update(verifier).digest("base64url"));
    const first = createPkcePair();
    const second = createPkcePair();
    expect(first.verifier).not.toBe(second.verifier);
    expect(first.challenge).toBe(codeChallenge(first.verifier));
  });
});

describe("spotifyConfig", () => {
  it("is null without a client id", () => {
    expect(spotifyConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(spotifyConfig({ SPOTIFY_CLIENT_ID: "  " } as NodeJS.ProcessEnv)).toBeNull();
  });

  it("builds the redirect from TELESCREEN_PUBLIC_URL and allows an override", () => {
    expect(spotifyConfig({ SPOTIFY_CLIENT_ID: "id" } as NodeJS.ProcessEnv)).toEqual({
      clientId: "id",
      clientSecret: null,
      redirectUri: "http://localhost:4000/auth/spotify/callback",
    });
    expect(
      spotifyConfig({ SPOTIFY_CLIENT_ID: "id", PORT: "8080" } as NodeJS.ProcessEnv)?.redirectUri,
    ).toBe("http://localhost:8080/auth/spotify/callback");
    expect(
      spotifyConfig({
        SPOTIFY_CLIENT_ID: "id",
        SPOTIFY_CLIENT_SECRET: "secret",
        TELESCREEN_PUBLIC_URL: "https://hub.example.ts.net:8444/",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      clientId: "id",
      clientSecret: "secret",
      redirectUri: "https://hub.example.ts.net:8444/auth/spotify/callback",
    });
    expect(
      spotifyConfig({
        SPOTIFY_CLIENT_ID: "id",
        SPOTIFY_REDIRECT_URI: "http://127.0.0.1:8788/auth/spotify/callback",
      } as NodeJS.ProcessEnv)?.redirectUri,
    ).toBe("http://127.0.0.1:8788/auth/spotify/callback");
  });
});

describe("token exchange", () => {
  it("sends the PKCE verifier plus the optional client secret", async () => {
    const { fn, log } = stubFetch(() => ({
      status: 200,
      body: { access_token: "at-1", refresh_token: "rt-1", expires_in: 3600 },
    }));
    const tokens = await exchangeSpotifyCode(CONFIG, "the-code", "the-verifier", { fetch: fn, now: () => NOW });
    expect(tokens).toEqual({ accessToken: "at-1", refreshToken: "rt-1", expiresAt: FUTURE });
    const request = log[0]!;
    expect(request.url.origin + request.url.pathname).toBe("https://accounts.spotify.com/api/token");
    const form = new URLSearchParams(request.body);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("the-code");
    expect(form.get("code_verifier")).toBe("the-verifier");
    expect(form.get("redirect_uri")).toBe(CONFIG.redirectUri);
    expect(form.get("client_id")).toBe("client-id");
    expect(form.get("client_secret")).toBe("client-secret");
  });

  it("refreshes with grant_type=refresh_token and a computed expiry", async () => {
    const { fn, log } = stubFetch(() => ({
      status: 200,
      body: { access_token: "at-2", refresh_token: "rt-2", expires_in: 1800 },
    }));
    const tokens = await refreshSpotifyToken(CONFIG, "rt-1", { fetch: fn, now: () => NOW });
    expect(tokens.accessToken).toBe("at-2");
    expect(tokens.refreshToken).toBe("rt-2");
    expect(tokens.expiresAt).toBe("2026-11-04T10:30:00.000Z");
    const form = new URLSearchParams(log[0]!.body);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("rt-1");
  });

  it("rejects an invalid grant as an auth error", async () => {
    const { fn } = stubFetch(() => ({ status: 400, body: { error: "invalid_grant", error_description: "Invalid code" } }));
    await expect(refreshSpotifyToken(CONFIG, "rt", { fetch: fn, now: () => NOW })).rejects.toBeInstanceOf(SpotifyAuthError);
  });
});

describe("SpotifyClient", () => {
  const secret = (overrides: { accessToken?: string; expiresAt?: string } = {}) => ({
    refreshToken: "rt-1",
    accessToken: "at-1",
    expiresAt: FUTURE,
    ...overrides,
  });

  it("reuses a valid access token without calling the token endpoint", async () => {
    const { fn, log } = stubFetch(() => ({ status: 204 }));
    const client = new SpotifyClient(secret(), CONFIG, { fetch: fn, now: () => NOW });
    await client.play();
    expect(log).toHaveLength(1);
    expect(log[0]!.headers.get("authorization")).toBe("Bearer at-1");
  });

  it("refreshes an expired token before the request and exposes the new secret", async () => {
    const { fn, log } = stubFetch((url) =>
      url.pathname === "/api/token"
        ? { status: 200, body: { access_token: "at-new", expires_in: 3600 } }
        : { status: 204 },
    );
    const client = new SpotifyClient(secret({ expiresAt: "2026-11-04T09:00:00.000Z" }), CONFIG, {
      fetch: fn,
      now: () => NOW,
    });
    await client.pause();
    expect(log.map((r) => r.url.pathname)).toEqual(["/api/token", "/v1/me/player/pause"]);
    expect(log[1]!.headers.get("authorization")).toBe("Bearer at-new");
    expect(client.secret.accessToken).toBe("at-new");
    expect(client.secret.refreshToken).toBe("rt-1");
    expect(client.secret.expiresAt).toBe(FUTURE);
  });

  it("refreshes and retries once on 401, then gives up with SpotifyAuthError", async () => {
    let playerCalls = 0;
    const { fn, log } = stubFetch((url) => {
      if (url.pathname === "/api/token") return { status: 200, body: { access_token: "at-2", expires_in: 3600 } };
      playerCalls++;
      return playerCalls === 1
        ? { status: 401, body: { error: { status: 401, message: "The access token expired" } } }
        : { status: 204 };
    });
    const client = new SpotifyClient(secret(), CONFIG, { fetch: fn, now: () => NOW });
    await expect(client.play()).resolves.toBeUndefined();
    expect(log.filter((r) => r.url.pathname === "/v1/me/player/play")).toHaveLength(2);
    expect(log.at(-1)!.headers.get("authorization")).toBe("Bearer at-2");

    const alwaysUnauthorized = stubFetch((url) =>
      url.pathname === "/api/token"
        ? { status: 200, body: { access_token: "at-3", expires_in: 3600 } }
        : { status: 401, body: { error: { status: 401, message: "Invalid access token" } } },
    );
    const rejected = new SpotifyClient(secret(), CONFIG, { fetch: alwaysUnauthorized.fn, now: () => NOW });
    await expect(rejected.play()).rejects.toBeInstanceOf(SpotifyAuthError);
    // Exactly one refresh + two attempts, never a loop.
    expect(alwaysUnauthorized.log.filter((r) => r.url.pathname === "/v1/me/player/play")).toHaveLength(2);
  });

  it("maps 404 no-active-device, 403 premium and 429 retry-after", async () => {
    const noDevice = stubFetch(() => ({
      status: 404,
      body: { error: { status: 404, message: "Player command failed: No active device found", reason: "NO_ACTIVE_DEVICE" } },
    }));
    await expect(
      new SpotifyClient(secret(), CONFIG, { fetch: noDevice.fn, now: () => NOW }).next(),
    ).rejects.toBeInstanceOf(SpotifyNoActiveDeviceError);

    const premium = stubFetch(() => ({
      status: 403,
      body: { error: { status: 403, message: "Player command failed: Premium required", reason: "PREMIUM_REQUIRED" } },
    }));
    await expect(
      new SpotifyClient(secret(), CONFIG, { fetch: premium.fn, now: () => NOW }).play(),
    ).rejects.toBeInstanceOf(SpotifyPremiumRequiredError);

    const limited = stubFetch(() => ({ status: 429, headers: { "retry-after": "7" }, body: {} }));
    const error = await new SpotifyClient(secret(), CONFIG, { fetch: limited.fn, now: () => NOW })
      .play()
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SpotifyRateLimitError);
    expect((error as SpotifyRateLimitError).retryAfterSeconds).toBe(7);

    const other = stubFetch(() => ({ status: 500, body: { error: { message: "Server error" } } }));
    await expect(
      new SpotifyClient(secret(), CONFIG, { fetch: other.fn, now: () => NOW }).play(),
    ).rejects.toBeInstanceOf(SpotifyError);
  });

  it("maps playback state: track, artists, largest album art, progress, device", async () => {
    const { fn } = stubFetch(() => ({
      status: 200,
      body: {
        is_playing: true,
        progress_ms: 42_000,
        device: { id: "dev-1", name: "Kitchen", type: "Speaker", volume_percent: 33, is_active: true },
        item: {
          id: "track-1",
          name: "Golden Hour",
          duration_ms: 208_000,
          artists: [{ name: "JVKE" }, { name: "Feature" }],
          album: {
            name: "this is what ____ feels like",
            images: [
              { url: "https://img/small.jpg", width: 64 },
              { url: "https://img/large.jpg", width: 640 },
              { url: "https://img/medium.jpg", width: 300 },
            ],
          },
        },
      },
    }));
    const state = await new SpotifyClient(secret(), CONFIG, { fetch: fn, now: () => NOW }).nowPlaying();
    expect(state).toEqual({
      track: {
        id: "track-1",
        title: "Golden Hour",
        artists: ["JVKE", "Feature"],
        album: "this is what ____ feels like",
        albumArtUrl: "https://img/large.jpg",
        durationMs: 208_000,
        progressMs: 42_000,
        isPlaying: true,
      },
      device: { id: "dev-1", name: "Kitchen", type: "Speaker", volumePercent: 33, isActive: true },
    });
  });

  it("returns null playback for 204 and lists devices", async () => {
    const idle = stubFetch(() => ({ status: 204 }));
    expect(await new SpotifyClient(secret(), CONFIG, { fetch: idle.fn, now: () => NOW }).nowPlaying()).toBeNull();

    const devices = stubFetch(() => ({
      status: 200,
      body: {
        devices: [
          { id: "dev-1", name: "Kitchen", type: "Speaker", volume_percent: 40, is_active: true },
          { id: null, name: "Group", type: "Group", volume_percent: null, is_active: false },
        ],
      },
    }));
    expect(await new SpotifyClient(secret(), CONFIG, { fetch: devices.fn, now: () => NOW }).devices()).toEqual([
      { id: "dev-1", name: "Kitchen", type: "Speaker", volumePercent: 40, isActive: true },
      { id: null, name: "Group", type: "Group", volumePercent: null, isActive: false },
    ]);
  });

  it("sends transport commands to the documented endpoints", async () => {
    const { fn, log } = stubFetch(() => ({ status: 204 }));
    const client = new SpotifyClient(secret(), CONFIG, { fetch: fn, now: () => NOW });
    await client.play();
    await client.pause();
    await client.next();
    await client.previous();
    await client.setVolume(35);
    await client.transfer("dev-2");
    expect(log.map((r) => `${r.method} ${r.url.pathname}${r.url.search}`)).toEqual([
      "PUT /v1/me/player/play",
      "PUT /v1/me/player/pause",
      "POST /v1/me/player/next",
      "POST /v1/me/player/previous",
      "PUT /v1/me/player/volume?volume_percent=35",
      "PUT /v1/me/player",
    ]);
    expect(JSON.parse(log.at(-1)!.body)).toEqual({ device_ids: ["dev-2"], play: true });
  });
});

describe("mapSpotifyError", () => {
  it("maps each typed failure to a clear API error", () => {
    expect(mapSpotifyError(new SpotifyNoActiveDeviceError("none"))).toMatchObject({
      code: "unprocessable",
      status: 422,
      details: { reason: "no_active_device" },
    });
    expect(mapSpotifyError(new SpotifyPremiumRequiredError())).toMatchObject({
      code: "forbidden",
      status: 403,
      details: { reason: "premium_required" },
    });
    expect(mapSpotifyError(new SpotifyAuthError())).toMatchObject({
      code: "unprocessable",
      details: { reason: "needs_reconnect" },
    });
    expect(mapSpotifyError(new SpotifyRateLimitError(3))).toMatchObject({
      code: "unavailable",
      status: 503,
      details: { reason: "rate_limited", retryAfterSeconds: 3 },
    });
    expect(mapSpotifyError(new SpotifyError("boom"))).toMatchObject({
      code: "provider_error",
      status: 502,
      details: { reason: "provider_error" },
    });
    const existing = new AppError("conflict", "already mapped");
    expect(mapSpotifyError(existing)).toBe(existing);
  });
});
