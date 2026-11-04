import { PageHeader, Surface } from "@/ui";
import { MusicPlayer } from "./MusicPlayer";
import styles from "./Music.module.css";

/** Music tab: Spotify Connect playback (visible only while the module flag is on). */
export function MusicScreen() {
  return (
    <>
      <PageHeader title="Music" subtitle="Spotify Connect" />
      <Surface>
        <div className={styles.pageWrap}>
          <MusicPlayer variant="page" />
        </div>
      </Surface>
    </>
  );
}
