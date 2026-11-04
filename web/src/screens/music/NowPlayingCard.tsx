import { MusicNotes } from "@phosphor-icons/react";
import { MusicPlayer } from "./MusicPlayer";
import styles from "./Music.module.css";

/** Right column (>= 1280px): compact now-playing card (SPEC §8, §6). */
export function NowPlayingCard() {
  return (
    <section className={styles.card} aria-labelledby="now-playing-h">
      <h2 className={styles.cardTitle} id="now-playing-h">
        <MusicNotes weight="fill" aria-hidden /> Now playing
        <span className={styles.pill}>Spotify</span>
      </h2>
      <MusicPlayer variant="card" />
    </section>
  );
}
