import { Link } from "@tanstack/react-router";
import { MusicNotes, Pause, Play, SkipBack, SkipForward, SpeakerHigh, SpeakerLow } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { errorMessage } from "@/api/errors";
import {
  musicErrorReason,
  useMusicConnection,
  useMusicDevices,
  useNowPlaying,
  useSetVolume,
  useSkipTrack,
  useTogglePlayback,
  useTransferPlayback,
  type PlaybackTrack,
} from "@/features/music";
import { Select, Slider, useToast, type SelectOption } from "@/ui";
import styles from "./Music.module.css";

/** Radix forbids empty item values, so "nothing active" is a real (non-selectable-in-effect) option. */
const NO_DEVICE = "none";

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** Between polls the bar advances locally (1 s tick) instead of jumping every 5 s. */
function useInterpolatedProgress(track: PlaybackTrack | null | undefined, syncedAt: number): number {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (!track?.isPlaying) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
    // Re-anchor when the polling data changes.
  }, [track?.isPlaying, track?.id, track?.progressMs]);
  if (!track) return 0;
  if (!track.isPlaying) return track.progressMs;
  return Math.min(track.durationMs, track.progressMs + Math.max(0, tick - syncedAt));
}

function ConnectPrompt({ reason }: { reason: "not_connected" | "needs_reconnect" | "not_configured" }) {
  return (
    <p className={styles.muted}>
      {reason === "not_configured" ? (
        "Spotify is not configured on the server."
      ) : reason === "needs_reconnect" ? (
        <>
          Spotify needs reconnecting. <Link to="/settings" className={styles.link}>Open Settings</Link>
        </>
      ) : (
        <>
          Spotify is not connected. <Link to="/settings" className={styles.link}>Connect in Settings</Link>
        </>
      )}
    </p>
  );
}

function Art({ track }: { track: PlaybackTrack }) {
  if (track.albumArtUrl) {
    return <img className={styles.art} src={track.albumArtUrl} alt={`${track.album ?? track.title} cover`} />;
  }
  return (
    <div className={styles.art} aria-hidden>
      <MusicNotes weight="duotone" />
    </div>
  );
}

/**
 * Now-playing panel with transport, volume and device picker. Shared by the
 * right-column card (`card`) and the Music tab (`page`).
 */
export function MusicPlayer({ variant = "card" }: { variant?: "card" | "page" }) {
  const toast = useToast();
  const connection = useMusicConnection();
  const connected = connection.data?.connected === true;
  const nowPlaying = useNowPlaying(connected);
  const devices = useMusicDevices(connected);
  const toggle = useTogglePlayback();
  const skip = useSkipTrack();
  const setVolume = useSetVolume();
  const transfer = useTransferPlayback();

  const device = nowPlaying.data?.device ?? null;
  const track = nowPlaying.data?.track ?? null;
  const progress = useInterpolatedProgress(track, nowPlaying.dataUpdatedAt);
  const [draftVolume, setDraftVolume] = useState(device?.volumePercent ?? 50);

  useEffect(() => {
    if (device?.volumePercent != null) setDraftVolume(device.volumePercent);
  }, [device?.volumePercent]);

  const failed = (error: unknown) => toast({ message: errorMessage(error) });

  const reason = nowPlaying.error ? musicErrorReason(nowPlaying.error) : null;
  if (connection.isLoading || (connection.isError && !connection.data)) {
    return <p className={styles.muted}>Checking Spotify…</p>;
  }
  if (connection.data?.configured === false) return <ConnectPrompt reason="not_configured" />;
  if (!connected) {
    return <ConnectPrompt reason={reason === "needs_reconnect" ? "needs_reconnect" : "not_connected"} />;
  }
  if (reason === "needs_reconnect" || reason === "not_connected" || reason === "not_configured") {
    return <ConnectPrompt reason={reason} />;
  }
  if (nowPlaying.isError && !nowPlaying.data) return <p className={styles.muted}>Unavailable</p>;
  if (nowPlaying.isLoading) return <p className={styles.muted}>Loading…</p>;

  const deviceOptions: SelectOption[] = (devices.data?.devices ?? []).flatMap((d) =>
    d.id === null ? [] : [{ value: d.id, label: d.name }],
  );
  if (device?.id && !deviceOptions.some((o) => o.value === device.id)) {
    deviceOptions.unshift({ value: device.id, label: device.name });
  }
  if (!device?.id) deviceOptions.unshift({ value: NO_DEVICE, label: "No active device" });

  return (
    <div className={styles.player} data-variant={variant}>
      {track ? (
        <>
          <div className={styles.top}>
            <Art track={track} />
            <div className={styles.titles}>
              <b className={styles.title}>{track.title}</b>
              <p className={styles.artists}>{track.artists.join(", ") || "Unknown artist"}</p>
            </div>
          </div>
          <div
            className={styles.progress}
            role="progressbar"
            aria-label="Track progress"
            aria-valuemin={0}
            aria-valuemax={track.durationMs}
            aria-valuenow={Math.round(progress)}
          >
            <span
              className={styles.progressFill}
              style={{ width: `${track.durationMs > 0 ? Math.min(100, (progress / track.durationMs) * 100) : 0}%` }}
            />
          </div>
          <div className={styles.times} aria-hidden>
            <span>{formatTime(progress)}</span>
            <span>{formatTime(track.durationMs)}</span>
          </div>
        </>
      ) : (
        <p className={styles.muted}>
          {device ? "Nothing playing" : "No active device. Pick one below or start Spotify on a device."}
        </p>
      )}

      <div className={styles.transport}>
        <button
          type="button"
          aria-label="Previous track"
          disabled={skip.isPending}
          onClick={() => skip.mutate("previous", { onError: failed })}
        >
          <SkipBack weight="fill" aria-hidden />
        </button>
        <button
          type="button"
          className={styles.primary}
          aria-label={track?.isPlaying ? "Pause" : "Play"}
          disabled={toggle.isPending}
          onClick={() => toggle.mutate(track?.isPlaying ? "pause" : "play", { onError: failed })}
        >
          {track?.isPlaying ? <Pause weight="fill" aria-hidden /> : <Play weight="fill" aria-hidden />}
        </button>
        <button
          type="button"
          aria-label="Next track"
          disabled={skip.isPending}
          onClick={() => skip.mutate("next", { onError: failed })}
        >
          <SkipForward weight="fill" aria-hidden />
        </button>
      </div>

      <div className={styles.volume}>
        <SpeakerLow aria-hidden />
        <Slider
          label="Volume"
          value={draftVolume}
          disabled={!device?.id || setVolume.isPending}
          onChange={setDraftVolume}
          onCommit={(percent) => {
            if (percent !== device?.volumePercent) setVolume.mutate(percent, { onError: failed });
          }}
        />
        <SpeakerHigh aria-hidden />
      </div>

      <div className={styles.device}>
        <SpeakerHigh aria-hidden />
        <Select
          label="Spotify device"
          value={device?.id ?? NO_DEVICE}
          disabled={transfer.isPending || deviceOptions.length === 0}
          options={deviceOptions}
          onValueChange={(value) => {
            if (value === NO_DEVICE || value === device?.id) return;
            transfer.mutate(value, { onError: failed });
          }}
        />
      </div>
    </div>
  );
}
