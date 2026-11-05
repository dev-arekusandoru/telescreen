import { z } from "@hono/zod-openapi";

/**
 * Named nullable components: zod-openapi attaches `.nullable()` to the registered
 * component when it wraps a named schema, so the nullable shape gets its own name
 * (typing it `{…} | null` in the generated client) instead of corrupting the base.
 */
const deviceShape = {
  id: z.string().nullable().describe("null for restricted devices (Spotify groups); they cannot receive playback."),
  name: z.string(),
  type: z.string().describe("Spotify device type, e.g. Computer, Smartphone, Speaker."),
  volumePercent: z.number().int().min(0).max(100).nullable(),
  isActive: z.boolean(),
};

export const musicDeviceSchema = z.object(deviceShape).openapi("MusicDevice");

const nullableDeviceSchema = z.object(deviceShape).nullable().openapi("MusicDeviceOrNull");

const trackShape = {
  id: z.string().nullable(),
  title: z.string(),
  artists: z.array(z.string()),
  album: z.string().nullable(),
  albumArtUrl: z.string().nullable(),
  durationMs: z.number().int(),
  progressMs: z.number().int(),
  isPlaying: z.boolean(),
};

export const playbackTrackSchema = z
  .object(trackShape)
  .nullable()
  .describe("null when nothing is playing: paused on no device, an ad, or no active device at all.")
  .openapi("PlaybackTrack");

export const nowPlayingSchema = z
  .object({
    track: playbackTrackSchema,
    device: nullableDeviceSchema,
  })
  .openapi("NowPlaying");

export const musicDeviceListSchema = z.object({ devices: z.array(musicDeviceSchema) }).openapi("MusicDeviceList");

export const musicConnectionSchema = z
  .object({
    connected: z.boolean(),
    configured: z.boolean().describe("false when SPOTIFY_CLIENT_ID is unset; connecting is unavailable."),
    label: z.string().nullable().describe("Spotify display name of the connected account."),
    status: z.enum(["ok", "error", "needs_auth"]).nullable(),
    lastError: z.string().nullable(),
  })
  .openapi("MusicConnection");

export const musicConnectStartSchema = z
  .object({ authUrl: z.string().describe("Send the browser here to grant Spotify access.") })
  .openapi("MusicConnectStart");

export const musicVolumeSchema = z
  .object({ percent: z.number().int().min(0).max(100) })
  .openapi("MusicVolumeInput");

export const musicDeviceInputSchema = z
  .object({ deviceId: z.string().min(1).describe("Non-null id from GET /music/devices.") })
  .openapi("MusicDeviceInput");

export const musicItemSchema = z
  .object({
    uri: z.string().min(1).describe("Spotify context URI, e.g. spotify:playlist:… or spotify:album:…"),
    kind: z.enum(["album", "playlist", "collection"]).describe("collection = Liked Songs."),
    title: z.string(),
    subtitle: z.string().nullable().describe("Artists for an album, track count for a playlist."),
    imageUrl: z.string().nullable(),
  })
  .openapi("MusicItem");

export const musicItemListSchema = z.object({ items: z.array(musicItemSchema) }).openapi("MusicItemList");

export const musicPlayContextSchema = z
  .object({ uri: z.string().regex(/^spotify:[a-z]+:[A-Za-z0-9:_-]+$/, "Expected a Spotify URI") })
  .openapi("MusicPlayContextInput");
