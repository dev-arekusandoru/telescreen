import { Link, useNavigate } from "@tanstack/react-router";
import { MusicNotes, Pause, Play, SkipBack, SkipForward } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { errorMessage } from "@/api/errors";
import {
  musicErrorReason,
  useMusicConnection,
  useNowPlaying,
  useSkipTrack,
  useTogglePlayback,
} from "@/features/music";
import { useToast } from "@/ui";
import { useInterpolatedProgress } from "./MusicPlayer";
import styles from "./Music.module.css";

/** Controls overlay hides itself after this much inactivity (touch / wall display). */
const CONTROLS_HIDE_MS = 10_000;

/**
 * Right column (>= 1280px): album-art-first now-playing widget.
 * Standby shows only title + artist and a thin progress line. A tap (or mouse hover)
 * reveals the controls; a tap on anything that is not a control opens the Music tab.
 */
export function NowPlayingCard() {
  const toast = useToast();
  const navigate = useNavigate();
  const connection = useMusicConnection();
  const connected = connection.data?.connected === true;
  const nowPlaying = useNowPlaying(connected);
  const toggle = useTogglePlayback();
  const skip = useSkipTrack();

  const track = nowPlaying.data?.track ?? null;
  const progress = useInterpolatedProgress(track, nowPlaying.dataUpdatedAt);

  const [shown, setShown] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const hovering = useRef(false);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setShown(false);
  }, []);
  const reveal = useCallback(() => {
    setShown(true);
    window.clearTimeout(timer.current);
    if (!hovering.current) timer.current = window.setTimeout(() => setShown(false), CONTROLS_HIDE_MS);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  // Controls are meaningless without a track.
  useEffect(() => {
    if (!track) hide();
  }, [track, hide]);

  const failed = (error: unknown) => toast({ message: errorMessage(error) });

  const reason = nowPlaying.error ? musicErrorReason(nowPlaying.error) : null;
  const connectionIssue: "not_configured" | "needs_reconnect" | "not_connected" | null =
    connection.data?.configured === false || reason === "not_configured"
      ? "not_configured"
      : reason === "needs_reconnect"
        ? "needs_reconnect"
        : connection.data && !connected
          ? "not_connected"
          : reason === "not_connected"
            ? "not_connected"
            : null;

  const dest = connectionIssue && connectionIssue !== "not_configured" ? "/settings" : "/music";
  const interactive = track !== null;

  const onClick = (event: MouseEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("button, a")) return; // controls and the screen-reader link handle themselves
    if (!interactive || shown) {
      hide();
      void navigate({ to: dest });
    } else {
      reveal();
    }
  };

  const pointerEnter = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return; // touch fires a synthetic enter on tap; the tap handler owns it
    hovering.current = true;
    if (interactive) reveal();
  };
  const pointerLeave = (event: React.PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    hovering.current = false;
    hide();
  };

  let body;
  if (track) {
    const pct = track.durationMs > 0 ? Math.min(100, (progress / track.durationMs) * 100) : 0;
    body = (
      <>
        {track.albumArtUrl ? (
          <img className={styles.wArt} src={track.albumArtUrl} alt="" />
        ) : (
          <div className={`${styles.wArt} ${styles.wArtFallback}`} aria-hidden>
            <MusicNotes weight="duotone" />
          </div>
        )}
        <div className={styles.wScrim} aria-hidden />
        <div className={styles.wMeta}>
          <b className={styles.wTitle}>{track.title}</b>
          <p className={styles.wArtist}>{track.artists.join(", ") || "Unknown artist"}</p>
        </div>
        <div
          className={styles.wProg}
          role="progressbar"
          aria-label="Track progress"
          aria-valuemin={0}
          aria-valuemax={track.durationMs}
          aria-valuenow={Math.round(progress)}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className={styles.wControls} aria-hidden={!shown}>
          <div className={styles.wTransport}>
            <button
              type="button"
              aria-label="Previous track"
              disabled={skip.isPending}
              onClick={() => {
                skip.mutate("previous", { onError: failed });
                reveal();
              }}
            >
              <SkipBack weight="fill" aria-hidden />
            </button>
            <button
              type="button"
              className={styles.wPlay}
              aria-label={track.isPlaying ? "Pause" : "Play"}
              disabled={toggle.isPending}
              onClick={() => {
                toggle.mutate(track.isPlaying ? "pause" : "play", { onError: failed });
                reveal();
              }}
            >
              {track.isPlaying ? <Pause weight="fill" aria-hidden /> : <Play weight="fill" aria-hidden />}
            </button>
            <button
              type="button"
              aria-label="Next track"
              disabled={skip.isPending}
              onClick={() => {
                skip.mutate("next", { onError: failed });
                reveal();
              }}
            >
              <SkipForward weight="fill" aria-hidden />
            </button>
          </div>
        </div>
      </>
    );
  } else {
    const loading = connection.isLoading || (connected && nowPlaying.isLoading);
    const copy = loading
      ? { title: "Checking Spotify…", sub: null }
      : connectionIssue === "not_configured"
        ? { title: "Spotify not set up", sub: "Spotify is not configured on the server." }
        : connectionIssue === "needs_reconnect"
          ? { title: "Reconnect Spotify", sub: "Tap to open Settings." }
          : connectionIssue === "not_connected"
            ? { title: "Connect Spotify", sub: "Tap to open Settings." }
            : nowPlaying.isError && !nowPlaying.data
              ? { title: "Unavailable", sub: "Can't reach Spotify right now." }
              : { title: "Nothing playing", sub: "Start Spotify on any device and it will show up here." };
    body = (
      <div className={styles.wEmptyBody}>
        <div className={styles.wBadge} aria-hidden>
          <MusicNotes weight="fill" />
        </div>
        <b className={styles.wEmptyTitle}>{copy.title}</b>
        {copy.sub ? <p className={styles.wEmptySub}>{copy.sub}</p> : null}
      </div>
    );
  }

  return (
    <section
      className={`${styles.widget} ${track ? "" : styles.widgetEmpty} ${shown ? styles.widgetShown : ""}`}
      aria-label="Now playing"
      onClick={onClick}
      onPointerEnter={pointerEnter}
      onPointerLeave={pointerLeave}
      onFocus={() => {
        if (interactive && !shown) reveal();
      }}
    >
      {body}
      <Link to={dest} className={styles.srOnly}>
        {dest === "/settings" ? "Open Settings" : "Open Music"}
      </Link>
    </section>
  );
}
