import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, client, unwrap, type components } from "@/api";

export type NowPlaying = components["schemas"]["NowPlaying"];
export type PlaybackTrack = NonNullable<components["schemas"]["PlaybackTrack"]>;
export type MusicDevice = components["schemas"]["MusicDevice"];
export type MusicDeviceOrNull = components["schemas"]["MusicDeviceOrNull"];
export type MusicConnection = components["schemas"]["MusicConnection"];
export type MusicItem = components["schemas"]["MusicItem"];

/** Pins are capped server-side (settings.musicPins). */
export const MAX_MUSIC_PINS = 6;

/** Poll cadence: fast while playing, slow when paused, near-idle when the tab is hidden. */
export const MUSIC_PLAYING_POLL_MS = 5_000;
export const MUSIC_IDLE_POLL_MS = 20_000;
export const MUSIC_HIDDEN_POLL_MS = 60_000;

export const musicKeys = {
  connection: ["music", "connection"] as const,
  nowPlaying: ["music", "now-playing"] as const,
  devices: ["music", "devices"] as const,
  recent: ["music", "recent"] as const,
  playlists: ["music", "playlists"] as const,
};

export const musicConnectionQuery = () => ({
  queryKey: musicKeys.connection,
  queryFn: () => unwrap(client.GET("/music/connection")),
  staleTime: 30_000,
});

export const useMusicConnection = () => useQuery(musicConnectionQuery());

/**
 * Current playback with adaptive polling. While playing it refetches every 5 s;
 * paused ("no active device", idle) backs off to 20 s, and a hidden tab to 60 s.
 */
export function useNowPlaying(enabled = true) {
  return useQuery({
    queryKey: musicKeys.nowPlaying,
    queryFn: () => unwrap(client.GET("/music/now-playing")),
    enabled,
    staleTime: 0,
    refetchInterval: (query) => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return MUSIC_HIDDEN_POLL_MS;
      return query.state.data?.track?.isPlaying ? MUSIC_PLAYING_POLL_MS : MUSIC_IDLE_POLL_MS;
    },
    refetchIntervalInBackground: false,
    // The poll is the retry: waiting out exponential backoff would hide "Unavailable" for seconds.
    retry: false,
  });
}

export const useMusicDevices = (enabled = true) =>
  useQuery({
    queryKey: musicKeys.devices,
    queryFn: () => unwrap(client.GET("/music/devices")),
    enabled,
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
  });

/** Distinct recently played albums. Spotify history lags a little, so a minute of staleness is fine. */
export const useRecentAlbums = (enabled = true) =>
  useQuery({
    queryKey: musicKeys.recent,
    queryFn: async () => (await unwrap(client.GET("/music/recent"))).items,
    enabled,
    staleTime: 60_000,
    retry: false,
  });

export const usePlaylists = (enabled = true) =>
  useQuery({
    queryKey: musicKeys.playlists,
    queryFn: async () => (await unwrap(client.GET("/music/playlists"))).items,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });

/** Start an album/playlist/Liked Songs. Spotify applies it a moment later, so refresh twice. */
export function usePlayContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (uri: string) => {
      await unwrap(client.POST("/music/play-context", { body: { uri } }));
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: musicKeys.nowPlaying });
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: musicKeys.nowPlaying });
        void qc.invalidateQueries({ queryKey: musicKeys.recent });
      }, 1500);
    },
  });
}

const playbackRequests = {
  play: () => client.POST("/music/play"),
  pause: () => client.POST("/music/pause"),
  next: () => client.POST("/music/next"),
  previous: () => client.POST("/music/previous"),
} as const;

export type PlaybackCommand = keyof typeof playbackRequests;

/** Play/pause flips the cached state immediately and rolls back if Spotify refuses. */
export function useTogglePlayback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (command: PlaybackCommand) => {
      await unwrap(playbackRequests[command]());
    },
    onMutate: async (command) => {
      if (command !== "play" && command !== "pause") return { previous: undefined };
      await qc.cancelQueries({ queryKey: musicKeys.nowPlaying });
      const previous = qc.getQueryData<NowPlaying>(musicKeys.nowPlaying);
      if (previous?.track) {
        qc.setQueryData<NowPlaying>(musicKeys.nowPlaying, {
          ...previous,
          track: { ...previous.track, isPlaying: command === "play" },
        });
      }
      return { previous };
    },
    onError: (_error, _command, context) => {
      if (context?.previous) qc.setQueryData(musicKeys.nowPlaying, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: musicKeys.nowPlaying }),
  });
}

export function useSkipTrack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (direction: "next" | "previous") => {
      await unwrap(playbackRequests[direction]());
    },
    onSettled: () => qc.invalidateQueries({ queryKey: musicKeys.nowPlaying }),
  });
}

/** Volume is applied optimistically to the cached device, then PATCHed to Spotify. */
export function useSetVolume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (percent: number) => {
      await unwrap(client.PUT("/music/volume", { body: { percent } }));
    },
    onMutate: async (percent) => {
      await qc.cancelQueries({ queryKey: musicKeys.nowPlaying });
      const previous = qc.getQueryData<NowPlaying>(musicKeys.nowPlaying);
      if (previous?.device) {
        qc.setQueryData<NowPlaying>(musicKeys.nowPlaying, {
          ...previous,
          device: { ...previous.device, volumePercent: percent },
        });
      }
      return { previous };
    },
    onError: (_error, _percent, context) => {
      if (context?.previous) qc.setQueryData(musicKeys.nowPlaying, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: musicKeys.nowPlaying }),
  });
}

export function useTransferPlayback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deviceId: string) => {
      await unwrap(client.PUT("/music/device", { body: { deviceId } }));
    },
    onSettled: () => Promise.all([
      qc.invalidateQueries({ queryKey: musicKeys.nowPlaying }),
      qc.invalidateQueries({ queryKey: musicKeys.devices }),
    ]),
  });
}

/** Resolves to the Spotify consent URL; the caller navigates the window there. */
export function useConnectSpotify() {
  return useMutation({
    mutationFn: async () => (await unwrap(client.POST("/music/connect/start"))).authUrl,
  });
}

export function useDisconnectSpotify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await unwrap(client.DELETE("/music/connection"));
    },
    onSuccess: () => {
      qc.removeQueries({ queryKey: musicKeys.nowPlaying });
      qc.removeQueries({ queryKey: musicKeys.devices });
      qc.removeQueries({ queryKey: musicKeys.recent });
      qc.removeQueries({ queryKey: musicKeys.playlists });
      return qc.invalidateQueries({ queryKey: musicKeys.connection });
    },
  });
}

/** Stable reasons the server attaches to Spotify failures (`error.details.reason`). */
export type MusicErrorReason =
  | "not_connected"
  | "not_configured"
  | "needs_reconnect"
  | "missing_scope"
  | "no_active_device"
  | "premium_required"
  | "rate_limited"
  | "provider_error"
  | "unknown";

const MUSIC_ERROR_REASONS: Record<Exclude<MusicErrorReason, "unknown">, true> = {
  not_connected: true,
  not_configured: true,
  needs_reconnect: true,
  missing_scope: true,
  no_active_device: true,
  premium_required: true,
  rate_limited: true,
  provider_error: true,
};

/** `details.reason` from an API error, for choosing the empty/unavailable state. */
export function musicErrorReason(error: unknown): MusicErrorReason {
  if (!(error instanceof ApiError)) return "unknown";
  const details = error.details;
  if (typeof details !== "object" || details === null || !("reason" in details)) return "unknown";
  const reason = details.reason;
  return typeof reason === "string" && Object.hasOwn(MUSIC_ERROR_REASONS, reason)
    ? (reason as MusicErrorReason)
    : "unknown";
}
