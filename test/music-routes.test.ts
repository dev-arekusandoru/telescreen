import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Db } from "../src/db/client.js";
import { musicConnections } from "../src/db/schema.js";
import { decryptSecret, encryptSecret } from "../src/lib/crypto.js";
import { codeChallenge } from "../src/music/spotify.js";
import { makeTestApp, type TestApp } from "./helpers.js";

process.env.HOMEHUB_SECRET_KEY ||= randomBytes(32).toString("hex");

const PUBLIC_URL = "https://hub.example.ts.net";
/** Fixed clock in helpers.ts is 2026-11-03T12:00:00.000Z. */
const FUTURE = "2026-11-03T13:00:00.000Z";
const PAST = "2026-11-03T09:00:00.000Z";

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };

interface Recorded {
  method: string;
  url: URL;
  headers: Headers;
  body: string;
}

/** Fetch stub with a router; `undefined` from the router is a test failure. */
function stubFetch(route: (req: Recorded) => Reply | undefined) {
  const log: Recorded[] = [];
  const fn = vi.fn(async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const body = typeof init?.body === "string" ? init.body : (init?.body?.toString() ?? "");
    const req: Recorded = { method: (init?.method ?? "GET").toUpperCase(), url, headers: new Headers(init?.headers), body };
    log.push(req);
    const reply = route(req);
    if (!reply) throw new Error(`unrouted ${req.method} ${url}`);
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { "content-type": "application/json", ...reply.headers },
    });
  });
  vi.stubGlobal("fetch", fn as unknown as typeof fetch);
  return log;
}

function seedConnection(db: Db, secret: Record<string, unknown> = {}) {
  db.insert(musicConnections)
    .values({
      id: "mus_test",
      provider: "spotify",
      label: "Alex",
      secretEncrypted: encryptSecret(
        JSON.stringify({ refreshToken: "rt-1", accessToken: "at-1", expiresAt: FUTURE, ...secret }),
      ),
      status: "ok",
      lastError: null,
    })
    .run();
}

/** Spotify reply for `GET /me/player` (204 = no active device). */
function playerReply(body?: unknown): Reply {
  return body === undefined ? { status: 204 } : { status: 200, body };
}

const PLAYING = {
  is_playing: true,
  progress_ms: 30_000,
  device: { id: "dev-1", name: "Kitchen", type: "Speaker", volume_percent: 40, is_active: true },
  item: {
    id: "track-1",
    name: "Golden Hour",
    duration_ms: 208_000,
    artists: [{ name: "JVKE" }],
    album: { name: "Golden Hour", images: [{ url: "https://img/640.jpg", width: 640 }] },
  },
};

let t: TestApp;
beforeEach(() => {
  process.env.SPOTIFY_CLIENT_ID = "client-id";
  process.env.SPOTIFY_CLIENT_SECRET = "client-secret";
  process.env.HOMEHUB_PUBLIC_URL = PUBLIC_URL;
  delete process.env.SPOTIFY_REDIRECT_URI;
  t = makeTestApp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SPOTIFY_CLIENT_ID;
  delete process.env.SPOTIFY_CLIENT_SECRET;
  delete process.env.HOMEHUB_PUBLIC_URL;
  delete process.env.SPOTIFY_REDIRECT_URI;
});

describe("GET /music/connection", () => {
  it("reports configured but not connected before OAuth", async () => {
    stubFetch(() => ({ status: 500 }));
    const { status, body } = await t.request("GET", "/api/v1/music/connection");
    expect(status).toBe(200);
    expect(body).toEqual({ connected: false, configured: true, label: null, status: null, lastError: null });
  });

  it("reports configured: false without SPOTIFY_CLIENT_ID", async () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    const { body } = await t.request<{ configured: boolean }>("GET", "/api/v1/music/connection");
    expect(body.configured).toBe(false);
  });
});

describe("Spotify OAuth (PKCE)", () => {
  it("builds a PKCE consent URL and completes the callback", async () => {
    const log = stubFetch((req) => {
      if (req.url.hostname === "accounts.spotify.com" && req.url.pathname === "/api/token") {
        return { status: 200, body: { access_token: "at-new", refresh_token: "rt-new", expires_in: 3600 } };
      }
      if (req.url.hostname === "api.spotify.com" && req.url.pathname === "/v1/me") {
        return { status: 200, body: { display_name: "Alex" } };
      }
      return undefined;
    });

    const start = await t.request<{ authUrl: string }>("POST", "/api/v1/music/connect/start");
    expect(start.status).toBe(200);
    const url = new URL(start.body.authUrl);
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    const params = url.searchParams;
    expect(params.get("client_id")).toBe("client-id");
    expect(params.get("response_type")).toBe("code");
    expect(params.get("redirect_uri")).toBe(`${PUBLIC_URL}/auth/spotify/callback`);
    expect(params.get("scope")).toBe(
      "user-read-playback-state user-modify-playback-state user-read-currently-playing user-read-recently-played playlist-read-private playlist-read-collaborative",
    );
    expect(params.get("code_challenge_method")).toBe("S256");
    expect(params.get("code_challenge")).toMatch(/^[A-Za-z0-9\-_]{43}$/);
    const state = params.get("state");
    expect(state).toBeTruthy();

    const callback = await t.app.request(`/auth/spotify/callback?code=code-1&state=${state}`);
    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/settings");

    // The verifier sent to the token endpoint must match the challenge in the consent URL.
    const tokenRequest = log.find((r) => r.url.hostname === "accounts.spotify.com")!;
    const form = new URLSearchParams(tokenRequest.body);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("code-1");
    expect(codeChallenge(form.get("code_verifier")!)).toBe(params.get("code_challenge"));

    const connection = await t.request<{ connected: boolean; label: string; status: string }>(
      "GET",
      "/api/v1/music/connection",
    );
    expect(connection.body).toMatchObject({ connected: true, configured: true, label: "Alex", status: "ok" });

    const row = t.db.select().from(musicConnections).all()[0]!;
    const secret = JSON.parse(decryptSecret(row.secretEncrypted)) as { refreshToken: string; accessToken: string };
    expect(secret).toMatchObject({ refreshToken: "rt-new", accessToken: "at-new" });
    expect(JSON.stringify(connection.body)).not.toContain("rt-new");
  });

  it("rejects an unknown state and an expired link", async () => {
    const response = await t.app.request("/auth/spotify/callback?code=code-1&state=bogus");
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("expired");
  });

  it("reports a cancelled consent screen", async () => {
    const response = await t.app.request("/auth/spotify/callback?error=access_denied");
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("cancelled");
  });

  it("422 when Spotify is not configured", async () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    const { status, body } = await t.request<{ error: { details: { reason: string } } }>(
      "POST",
      "/api/v1/music/connect/start",
    );
    expect(status).toBe(422);
    expect(body.error.details.reason).toBe("not_configured");
  });
});

describe("playback routes", () => {
  it("returns track, artists, album art, progress and device", async () => {
    seedConnection(t.db);
    stubFetch((req) =>
      req.url.pathname === "/v1/me/player" && req.method === "GET" ? playerReply(PLAYING) : undefined,
    );
    const { status, body } = await t.request("GET", "/api/v1/music/now-playing");
    expect(status).toBe(200);
    expect(body).toEqual({
      track: {
        id: "track-1",
        title: "Golden Hour",
        artists: ["JVKE"],
        album: "Golden Hour",
        albumArtUrl: "https://img/640.jpg",
        durationMs: 208_000,
        progressMs: 30_000,
        isPlaying: true,
      },
      device: { id: "dev-1", name: "Kitchen", type: "Speaker", volumePercent: 40, isActive: true },
    });
  });

  it("maps a Spotify 204 to an empty playback state", async () => {
    seedConnection(t.db);
    stubFetch((req) => (req.url.pathname === "/v1/me/player" ? playerReply() : undefined));
    const { status, body } = await t.request("GET", "/api/v1/music/now-playing");
    expect(status).toBe(200);
    expect(body).toEqual({ track: null, device: null });
  });

  it("lists Connect devices", async () => {
    seedConnection(t.db);
    stubFetch((req) =>
      req.url.pathname === "/v1/me/player/devices"
        ? {
            status: 200,
            body: { devices: [{ id: "dev-1", name: "Kitchen", type: "Speaker", volume_percent: 40, is_active: true }] },
          }
        : undefined,
    );
    const { body } = await t.request("GET", "/api/v1/music/devices");
    expect(body).toEqual({
      devices: [{ id: "dev-1", name: "Kitchen", type: "Speaker", volumePercent: 40, isActive: true }],
    });
  });

  it("sends transport commands and returns 204", async () => {
    seedConnection(t.db);
    const log = stubFetch(() => ({ status: 204 }));
    for (const command of ["play", "pause", "next", "previous"]) {
      const { status } = await t.request("POST", `/api/v1/music/${command}`);
      expect(status).toBe(204);
    }
    expect(await t.request("PUT", "/api/v1/music/volume", { percent: 35 })).toMatchObject({ status: 204 });
    expect(await t.request("PUT", "/api/v1/music/device", { deviceId: "dev-2" })).toMatchObject({ status: 204 });

    const calls = log.map((r) => `${r.method} ${r.url.pathname}${r.url.search}`);
    expect(calls).toEqual([
      "PUT /v1/me/player/play",
      "PUT /v1/me/player/pause",
      "POST /v1/me/player/next",
      "POST /v1/me/player/previous",
      "PUT /v1/me/player/volume?volume_percent=35",
      "PUT /v1/me/player",
    ]);
    expect(JSON.parse(log.at(-1)!.body)).toEqual({ device_ids: ["dev-2"], play: true });
  });

  it("validates volume and device input", async () => {
    seedConnection(t.db);
    stubFetch(() => ({ status: 204 }));
    expect((await t.request("PUT", "/api/v1/music/volume", { percent: 101 })).status).toBe(400);
    expect((await t.request("PUT", "/api/v1/music/device", { deviceId: "" })).status).toBe(400);
  });

  it("maps no active device to 422 with a reason", async () => {
    seedConnection(t.db);
    stubFetch(() => ({
      status: 404,
      body: { error: { status: 404, message: "Player command failed: No active device found", reason: "NO_ACTIVE_DEVICE" } },
    }));
    const { status, body } = await t.request<{ error: { code: string; details: { reason: string } } }>(
      "POST",
      "/api/v1/music/play",
    );
    expect(status).toBe(422);
    expect(body.error.details.reason).toBe("no_active_device");
  });

  it("maps non-Premium 403 and rate limits", async () => {
    seedConnection(t.db);
    stubFetch(() => ({
      status: 403,
      body: { error: { status: 403, message: "Player command failed: Premium required", reason: "PREMIUM_REQUIRED" } },
    }));
    const premium = await t.request<{ error: { code: string; details: { reason: string } } }>(
      "POST",
      "/api/v1/music/play",
    );
    expect(premium.status).toBe(403);
    expect(premium.body.error).toMatchObject({ code: "forbidden" });
    expect(premium.body.error.details.reason).toBe("premium_required");

    vi.unstubAllGlobals();
    stubFetch(() => ({ status: 429, headers: { "retry-after": "4" }, body: {} }));
    const limited = await t.request<{ error: { code: string; details: { reason: string; retryAfterSeconds: number } } }>(
      "POST",
      "/api/v1/music/next",
    );
    expect(limited.status).toBe(503);
    expect(limited.body.error).toMatchObject({
      code: "unavailable",
      details: { reason: "rate_limited", retryAfterSeconds: 4 },
    });
  });

  it("refreshes an expired token and persists the new one", async () => {
    seedConnection(t.db, { expiresAt: PAST });
    const log = stubFetch((req) => {
      if (req.url.hostname === "accounts.spotify.com") {
        return { status: 200, body: { access_token: "at-2", expires_in: 3600 } };
      }
      return playerReply(PLAYING);
    });
    expect((await t.request("GET", "/api/v1/music/now-playing")).status).toBe(200);
    expect(log.map((r) => r.url.pathname)).toEqual(["/api/token", "/v1/me/player"]);
    expect(log[1]!.headers.get("authorization")).toBe("Bearer at-2");

    const row = t.db.select().from(musicConnections).all()[0]!;
    const secret = JSON.parse(decryptSecret(row.secretEncrypted)) as { accessToken: string; refreshToken: string };
    expect(secret).toMatchObject({ accessToken: "at-2", refreshToken: "rt-1" });
  });

  it("refreshes and retries once on 401, then flags needs_auth", async () => {
    seedConnection(t.db);
    let attempts = 0;
    stubFetch((req) => {
      if (req.url.hostname === "accounts.spotify.com") {
        return { status: 200, body: { access_token: "at-2", expires_in: 3600 } };
      }
      attempts++;
      return attempts === 1
        ? { status: 401, body: { error: { status: 401, message: "The access token expired" } } }
        : playerReply(PLAYING);
    });
    const ok = await t.request("GET", "/api/v1/music/now-playing");
    expect(ok.status).toBe(200);
    expect(attempts).toBe(2);

    // Now let Spotify reject the stored credentials outright.
    vi.unstubAllGlobals();
    t.db.delete(musicConnections).run();
    seedConnection(t.db);
    stubFetch((req) => {
      if (req.url.hostname === "accounts.spotify.com") {
        return { status: 400, body: { error: "invalid_grant", error_description: "Refresh token revoked" } };
      }
      return { status: 401, body: { error: { status: 401, message: "Invalid access token" } } };
    });
    const rejected = await t.request<{ error: { code: string; details: { reason: string } } }>(
      "GET",
      "/api/v1/music/now-playing",
    );
    expect(rejected.status).toBe(422);
    expect(rejected.body.error.details.reason).toBe("needs_reconnect");

    const connection = await t.request<{ status: string; lastError: string | null }>(
      "GET",
      "/api/v1/music/connection",
    );
    expect(connection.body.status).toBe("needs_auth");
    expect(connection.body.lastError).toContain("Refresh token revoked");
  });

  it("422 not_connected when nothing is connected", async () => {
    const { status, body } = await t.request<{ error: { details: { reason: string } } }>(
      "GET",
      "/api/v1/music/now-playing",
    );
    expect(status).toBe(422);
    expect(body.error.details.reason).toBe("not_connected");
  });

  it("disconnects and forgets the token", async () => {
    seedConnection(t.db);
    expect((await t.request("DELETE", "/api/v1/music/connection")).status).toBe(204);
    expect(t.db.select().from(musicConnections).all()).toHaveLength(0);
    const after = await t.request<{ error: { details: { reason: string } } }>("GET", "/api/v1/music/now-playing");
    expect(after.status).toBe(422);
    expect(after.body.error.details.reason).toBe("not_connected");
  });
});

describe("library routes", () => {
  const ALBUM = (n: number) => ({
    uri: `spotify:album:a${n}`,
    name: `Album ${n}`,
    artists: [{ name: "Artist" }, { name: "Guest" }],
    images: [{ url: `https://img/${n}-64.jpg`, width: 64 }, { url: `https://img/${n}-640.jpg`, width: 640 }],
  });

  it("collapses recently played tracks into distinct albums", async () => {
    seedConnection(t.db);
    stubFetch((req) =>
      req.url.pathname === "/v1/me/player/recently-played"
        ? {
            status: 200,
            body: { items: [1, 1, 2, 1, 3].map((n) => ({ track: { name: "t", album: ALBUM(n) } })) },
          }
        : undefined,
    );
    const { status, body } = await t.request<{ items: unknown[] }>("GET", "/api/v1/music/recent");
    expect(status).toBe(200);
    expect(body.items).toEqual([
      { uri: "spotify:album:a1", kind: "album", title: "Album 1", subtitle: "Artist, Guest", imageUrl: "https://img/1-640.jpg" },
      { uri: "spotify:album:a2", kind: "album", title: "Album 2", subtitle: "Artist, Guest", imageUrl: "https://img/2-640.jpg" },
      { uri: "spotify:album:a3", kind: "album", title: "Album 3", subtitle: "Artist, Guest", imageUrl: "https://img/3-640.jpg" },
    ]);
  });

  it("collapses tracks played from a playlist into that playlist", async () => {
    seedConnection(t.db);
    const ctx = { type: "playlist", uri: "spotify:playlist:p1" };
    stubFetch((req) => {
      if (req.url.pathname === "/v1/me/player/recently-played") {
        return {
          status: 200,
          body: {
            items: [
              { track: { album: ALBUM(1) }, context: ctx },
              { track: { album: ALBUM(2) }, context: ctx },
              { track: { album: ALBUM(3) }, context: null },
            ],
          },
        };
      }
      if (req.url.pathname === "/v1/me/playlists") {
        return { status: 200, body: { items: [{ uri: "spotify:playlist:p1", name: "Dinner", images: [], tracks: { total: 2 } }] } };
      }
      if (req.url.pathname === "/v1/me") return { status: 200, body: { id: "alex" } };
      return undefined;
    });
    const { body } = await t.request<{ items: Array<{ uri: string }> }>("GET", "/api/v1/music/recent");
    expect(body.items.map((i) => i.uri)).toEqual(["spotify:playlist:p1", "spotify:album:a3"]);
  });

  it("groups artist plays and pages back for more history", async () => {
    seedConnection(t.db);
    const artist = { type: "artist", uri: "spotify:artist:x1" };
    const befores: Array<string | null> = [];
    stubFetch((req) => {
      if (req.url.pathname === "/v1/me/player/recently-played") {
        const before = req.url.searchParams.get("before");
        befores.push(before);
        return {
          status: 200,
          body: before
            ? { items: [{ track: { album: ALBUM(2) }, context: null }] }
            : { items: [{ track: { album: ALBUM(1) }, context: artist }, { track: { album: ALBUM(9) }, context: artist }], cursors: { before: "123" } },
        };
      }
      if (req.url.pathname === "/v1/artists/x1") {
        return { status: 200, body: { name: "Marlowe", images: [{ url: "https://img/x1.jpg", width: 320 }] } };
      }
      return undefined;
    });
    const { body } = await t.request<{ items: Array<{ uri: string; kind: string; title: string }> }>("GET", "/api/v1/music/recent");
    expect(befores).toEqual([null, "123"]);
    expect(body.items.map((i) => [i.uri, i.kind, i.title])).toEqual([
      ["spotify:artist:x1", "artist", "Marlowe"],
      ["spotify:album:a2", "album", "Album 2"],
    ]);
  });

  it("lists playlists with Liked Songs first and tolerates missing art", async () => {
    seedConnection(t.db);
    stubFetch((req) => {
      if (req.url.pathname === "/v1/me/playlists") {
        return {
          status: 200,
          body: {
            items: [
              { uri: "spotify:playlist:p1", name: "Dinner", images: [], tracks: { total: 12 } },
              null,
              { uri: "spotify:playlist:p2", name: "One", images: [{ url: "https://img/p2.jpg", width: 300 }], tracks: { total: 1 } },
            ],
          },
        };
      }
      if (req.url.pathname === "/v1/me") return { status: 200, body: { id: "alex" } };
      return undefined;
    });
    const { body } = await t.request<{ items: Array<{ title: string; subtitle: string | null; imageUrl: string | null; uri: string }> }>(
      "GET",
      "/api/v1/music/playlists",
    );
    expect(body.items.map((i) => i.title)).toEqual(["Liked Songs", "Dinner", "One"]);
    expect(body.items[0]!.uri).toBe("spotify:user:alex:collection");
    expect(body.items[1]).toMatchObject({ subtitle: "12 songs", imageUrl: null });
    expect(body.items[2]).toMatchObject({ subtitle: "1 song", imageUrl: "https://img/p2.jpg" });
  });

  it("asks to reconnect when the token predates the library scopes", async () => {
    seedConnection(t.db);
    stubFetch(() => ({ status: 403, body: { error: { status: 403, message: "Insufficient client scope" } } }));
    const { status, body } = await t.request<{ error: { details: { reason: string } } }>("GET", "/api/v1/music/recent");
    expect(status).toBe(422);
    expect(body.error.details.reason).toBe("missing_scope");
    // Playback keeps working, so the connection must not be flagged as needing auth.
    const connection = await t.request<{ status: string }>("GET", "/api/v1/music/connection");
    expect(connection.body.status).toBe("ok");
  });

  it("plays a context on the active device", async () => {
    seedConnection(t.db);
    const log = stubFetch((req) => (req.url.pathname === "/v1/me/player/play" ? { status: 204 } : undefined));
    const { status } = await t.request("POST", "/api/v1/music/play-context", { uri: "spotify:playlist:p1" });
    expect(status).toBe(204);
    expect(JSON.parse(log[0]!.body)).toEqual({ context_uri: "spotify:playlist:p1" });
    expect(log[0]!.url.searchParams.get("device_id")).toBeNull();
  });

  it("falls back to the first available device when none is active", async () => {
    seedConnection(t.db);
    let first = true;
    const log = stubFetch((req) => {
      if (req.url.pathname === "/v1/me/player/play") {
        if (first) {
          first = false;
          return { status: 404, body: { error: { status: 404, message: "No active device found", reason: "NO_ACTIVE_DEVICE" } } };
        }
        return { status: 204 };
      }
      if (req.url.pathname === "/v1/me/player/devices") {
        return { status: 200, body: { devices: [{ id: null, name: "Group" }, { id: "dev-9", name: "Kitchen" }] } };
      }
      return undefined;
    });
    const { status } = await t.request("POST", "/api/v1/music/play-context", { uri: "spotify:album:a1" });
    expect(status).toBe(204);
    const retry = log.at(-1)!;
    expect(retry.url.searchParams.get("device_id")).toBe("dev-9");
  });

  it("still reports no_active_device when Spotify lists no usable device", async () => {
    seedConnection(t.db);
    stubFetch((req) => {
      if (req.url.pathname === "/v1/me/player/play") {
        return { status: 404, body: { error: { status: 404, message: "No active device found", reason: "NO_ACTIVE_DEVICE" } } };
      }
      return { status: 200, body: { devices: [] } };
    });
    const { status, body } = await t.request<{ error: { details: { reason: string } } }>("POST", "/api/v1/music/play-context", {
      uri: "spotify:album:a1",
    });
    expect(status).toBe(422);
    expect(body.error.details.reason).toBe("no_active_device");
  });

  it("rejects anything that is not a Spotify URI", async () => {
    seedConnection(t.db);
    stubFetch(() => ({ status: 500 }));
    const { status } = await t.request("POST", "/api/v1/music/play-context", { uri: "https://evil.example" });
    expect(status).toBe(400);
  });
});
