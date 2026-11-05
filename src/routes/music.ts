import { createRoute } from "@hono/zod-openapi";
import {
  musicConnectStartSchema,
  musicConnectionSchema,
  musicDeviceInputSchema,
  musicDeviceListSchema,
  musicItemListSchema,
  musicPlayContextSchema,
  musicVolumeSchema,
  nowPlayingSchema,
} from "../schemas/music.js";
import { disconnectMusic, getMusicConnection, startSpotifyAuth, withSpotify } from "../services/music.js";
import type { ApiApp } from "./index.js";
import { json } from "./util.js";

const tags = ["music"];

const connectionRoute = createRoute({
  method: "get",
  path: "/music/connection",
  tags,
  summary: "Spotify connection status",
  description:
    "Whether Spotify is connected and configured. Drives Settings > Music. Never includes tokens; 204 responses from Spotify surface as a typed `no_active_device` error on the playback routes.",
  responses: { 200: { description: "Connection status", content: json(musicConnectionSchema) } },
});

const connectStartRoute = createRoute({
  method: "post",
  path: "/music/connect/start",
  tags,
  summary: "Start Spotify OAuth (PKCE)",
  description:
    "Returns the Spotify consent URL; the browser comes back through /auth/spotify/callback. 422 when SPOTIFY_CLIENT_ID is unset.",
  responses: { 200: { description: "Consent URL", content: json(musicConnectStartSchema) } },
});

const disconnectRoute = createRoute({
  method: "delete",
  path: "/music/connection",
  tags,
  summary: "Disconnect Spotify",
  description: "Forgets the stored refresh token. Nothing changes in the Spotify account.",
  responses: { 204: { description: "Disconnected" } },
});

const nowPlayingRoute = createRoute({
  method: "get",
  path: "/music/now-playing",
  tags,
  summary: "Current playback",
  description:
    "Track, artists, album art and progress from Spotify `GET /me/player`, plus the active device. `track` is null when nothing is playing or no device is active. 422 `not_connected` / `needs_reconnect`; 503 `rate_limited` (details.retryAfterSeconds).",
  responses: { 200: { description: "Playback state", content: json(nowPlayingSchema) } },
});

const devicesRoute = createRoute({
  method: "get",
  path: "/music/devices",
  tags,
  summary: "Available Spotify Connect devices",
  description: "Drives the device picker. `id` is null for restricted devices, which cannot receive playback.",
  responses: { 200: { description: "Devices", content: json(musicDeviceListSchema) } },
});

const playRoute = createRoute({
  method: "post",
  path: "/music/play",
  tags,
  summary: "Resume playback",
  description: "422 `no_active_device` when Spotify has no active device; 403 `premium_required` without Premium.",
  responses: { 204: { description: "Command accepted" } },
});

const pauseRoute = createRoute({
  method: "post",
  path: "/music/pause",
  tags,
  summary: "Pause playback",
  responses: { 204: { description: "Command accepted" } },
});

const nextRoute = createRoute({
  method: "post",
  path: "/music/next",
  tags,
  summary: "Skip to the next track",
  responses: { 204: { description: "Command accepted" } },
});

const previousRoute = createRoute({
  method: "post",
  path: "/music/previous",
  tags,
  summary: "Go back to the previous track",
  responses: { 204: { description: "Command accepted" } },
});

const volumeRoute = createRoute({
  method: "put",
  path: "/music/volume",
  tags,
  summary: "Set the active device's volume",
  request: { body: { content: json(musicVolumeSchema), required: true } },
  responses: { 204: { description: "Volume set" } },
});

const deviceRoute = createRoute({
  method: "put",
  path: "/music/device",
  tags,
  summary: "Transfer playback to a device",
  description: "Moves playback to `deviceId` (from GET /music/devices) and starts it there.",
  request: { body: { content: json(musicDeviceInputSchema), required: true } },
  responses: { 204: { description: "Playback transferred" } },
});

const recentRoute = createRoute({
  method: "get",
  path: "/music/recent",
  tags,
  summary: "Recently played albums",
  description:
    "Distinct albums from Spotify's play history, newest first (max 12). 422 `missing_scope` until Spotify is reconnected after the library scopes were added.",
  responses: { 200: { description: "Albums", content: json(musicItemListSchema) } },
});

const playlistsRoute = createRoute({
  method: "get",
  path: "/music/playlists",
  tags,
  summary: "The account's playlists",
  description: "Up to 50 playlists, preceded by a synthetic Liked Songs entry. 422 `missing_scope` as for recent.",
  responses: { 200: { description: "Playlists", content: json(musicItemListSchema) } },
});

const playContextRoute = createRoute({
  method: "post",
  path: "/music/play-context",
  tags,
  summary: "Play an album, playlist or Liked Songs",
  description:
    "Starts `uri` on the active device; with none active, falls back to the first available Connect device. 422 `no_active_device` if there is no device at all; 403 `premium_required`.",
  request: { body: { content: json(musicPlayContextSchema), required: true } },
  responses: { 204: { description: "Playback started" } },
});

export function registerMusicRoutes(app: ApiApp): void {
  app.openapi(connectionRoute, (c) => c.json(getMusicConnection(c.var.ctx), 200));
  app.openapi(connectStartRoute, (c) => c.json(startSpotifyAuth(c.var.ctx), 200));
  app.openapi(disconnectRoute, (c) => {
    disconnectMusic(c.var.ctx.db);
    return c.body(null, 204);
  });
  app.openapi(nowPlayingRoute, async (c) => {
    const state = await withSpotify(c.var.ctx, (client) => client.nowPlaying());
    return c.json({ track: state?.track ?? null, device: state?.device ?? null }, 200);
  });
  app.openapi(devicesRoute, async (c) => {
    const devices = await withSpotify(c.var.ctx, (client) => client.devices());
    return c.json({ devices }, 200);
  });
  app.openapi(playRoute, async (c) => {
    await withSpotify(c.var.ctx, (client) => client.play());
    return c.body(null, 204);
  });
  app.openapi(pauseRoute, async (c) => {
    await withSpotify(c.var.ctx, (client) => client.pause());
    return c.body(null, 204);
  });
  app.openapi(nextRoute, async (c) => {
    await withSpotify(c.var.ctx, (client) => client.next());
    return c.body(null, 204);
  });
  app.openapi(previousRoute, async (c) => {
    await withSpotify(c.var.ctx, (client) => client.previous());
    return c.body(null, 204);
  });
  app.openapi(volumeRoute, async (c) => {
    const { percent } = c.req.valid("json");
    await withSpotify(c.var.ctx, (client) => client.setVolume(percent));
    return c.body(null, 204);
  });
  app.openapi(deviceRoute, async (c) => {
    const { deviceId } = c.req.valid("json");
    await withSpotify(c.var.ctx, (client) => client.transfer(deviceId));
    return c.body(null, 204);
  });
  app.openapi(recentRoute, async (c) => {
    const items = await withSpotify(c.var.ctx, (client) => client.recentAlbums());
    return c.json({ items }, 200);
  });
  app.openapi(playlistsRoute, async (c) => {
    const items = await withSpotify(c.var.ctx, (client) => client.playlists());
    return c.json({ items }, 200);
  });
  app.openapi(playContextRoute, async (c) => {
    const { uri } = c.req.valid("json");
    await withSpotify(c.var.ctx, (client) => client.playContext(uri));
    return c.body(null, 204);
  });
}
