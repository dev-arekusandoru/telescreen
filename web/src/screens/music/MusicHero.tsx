import { MusicNotes, Pause, Play, SkipBack, SkipForward } from "@phosphor-icons/react";
import { errorMessage } from "@/api/errors";
import { useNowPlaying, useSkipTrack, useTogglePlayback } from "@/features/music";
import { useToast } from "@/ui";
import { useInterpolatedProgress } from "./MusicPlayer";
import styles from "./MusicPage.module.css";

const formatTime = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** Now-playing hero: big cover on an ambient glow of its own colors, title, progress, transport. */
export function MusicHero() {
  const toast = useToast();
  const nowPlaying = useNowPlaying(true);
  const toggle = useTogglePlayback();
  const skip = useSkipTrack();
  const track = nowPlaying.data?.track ?? null;
  const progress = useInterpolatedProgress(track, nowPlaying.dataUpdatedAt);
  const failed = (error: unknown) => toast({ message: errorMessage(error) });

  const unavailable = nowPlaying.isError && !nowPlaying.data;
  const art = track?.albumArtUrl ?? null;
  const pct = track && track.durationMs > 0 ? Math.min(100, (progress / track.durationMs) * 100) : 0;

  return (
    <section
      className={styles.hero}
      aria-label="Now playing"
      style={art ? ({ "--art": `url("${art}")` } as React.CSSProperties) : undefined}
    >
      {art ? (
        <img className={styles.heroArt} src={art} alt={`${track?.album ?? track?.title ?? "Album"} cover`} />
      ) : (
        <div className={`${styles.heroArt} ${styles.heroArtEmpty}`} aria-hidden>
          <MusicNotes weight="duotone" />
        </div>
      )}

      <div className={styles.heroInfo}>
        <span className={styles.eyebrow}>{track ? "Now playing" : "Standby"}</span>
        {track ? (
          <>
            <h2 className={styles.heroTitle}>{track.title}</h2>
            <p className={styles.heroArtist}>{track.artists.join(", ") || "Unknown artist"}</p>
            <div>
              <div
                className={styles.progress}
                role="progressbar"
                aria-label="Track progress"
                aria-valuemin={0}
                aria-valuemax={track.durationMs}
                aria-valuenow={Math.round(progress)}
              >
                <span style={{ width: `${pct}%` }} />
              </div>
              <div className={styles.times} aria-hidden>
                <span>{formatTime(progress)}</span>
                <span>{formatTime(track.durationMs)}</span>
              </div>
            </div>
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
                className={styles.play}
                aria-label={track.isPlaying ? "Pause" : "Play"}
                disabled={toggle.isPending}
                onClick={() => toggle.mutate(track.isPlaying ? "pause" : "play", { onError: failed })}
              >
                {track.isPlaying ? <Pause weight="fill" aria-hidden /> : <Play weight="fill" aria-hidden />}
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
          </>
        ) : (
          <>
            <h2 className={styles.heroTitle}>{unavailable ? "Unavailable" : "Nothing playing"}</h2>
            <p className={styles.heroArtist}>
              {unavailable ? "Can't reach Spotify right now." : "Pick something below and it will start right away."}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
