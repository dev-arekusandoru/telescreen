import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { errorMessage } from "@/api/errors";
import {
  MAX_MUSIC_PINS,
  musicErrorReason,
  useMusicConnection,
  useNowPlaying,
  usePlayContext,
  usePlaylists,
  useRecentAlbums,
  type MusicItem,
} from "@/features/music";
import { useSettings, useUpdateSettings } from "@/features/queries";
import { PageHeader, Surface, useToast } from "@/ui";
import { MusicHero } from "./MusicHero";
import { ConnectPrompt } from "./MusicPlayer";
import { Chip, Tile } from "./MusicTiles";
import styles from "./MusicPage.module.css";

type Query = { isLoading: boolean; isError: boolean; error: unknown; data: MusicItem[] | undefined; refetch: () => unknown };

function Shelf({
  title,
  query,
  editing,
  pinnedUris,
  onActivate,
  empty,
}: {
  title: string;
  query: Query;
  editing: boolean;
  pinnedUris: Set<string>;
  onActivate: (item: MusicItem) => void;
  empty: string;
}) {
  let body: ReactNode;
  if (query.isLoading) {
    body = (
      <div className={styles.shelf} aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={styles.skeleton} />
        ))}
      </div>
    );
  } else if (query.isError || !query.data) {
    body = (
      <p className={styles.muted}>
        Couldn't load this.{" "}
        <button type="button" className={styles.linkBtn} onClick={() => void query.refetch()}>
          Try again
        </button>
      </p>
    );
  } else if (query.data.length === 0) {
    body = <p className={styles.muted}>{empty}</p>;
  } else {
    body = (
      <div className={styles.shelf}>
        {query.data.map((item) => (
          <Tile key={item.uri} item={item} editing={editing} pinned={pinnedUris.has(item.uri)} onActivate={onActivate} />
        ))}
      </div>
    );
  }
  return (
    <section className={styles.section} aria-label={title}>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {body}
    </section>
  );
}

/** Music tab: now-playing hero, pinned shortcuts, and shelves of recent albums and playlists. */
export function MusicScreen() {
  const toast = useToast();
  const connection = useMusicConnection();
  const connected = connection.data?.connected === true;
  const nowPlaying = useNowPlaying(connected);
  const recent = useRecentAlbums(connected);
  const playlists = usePlaylists(connected);
  const play = usePlayContext();
  const settings = useSettings();
  const updateSettings = useUpdateSettings();
  const [editing, setEditing] = useState(false);

  const pins = settings.data?.musicPins ?? [];
  const pinnedUris = new Set(pins.map((p) => p.uri));
  const failed = (error: unknown) => toast({ message: errorMessage(error) });

  const header = <PageHeader title="Music" subtitle="Spotify" />;
  const reason = nowPlaying.error ? musicErrorReason(nowPlaying.error) : null;

  if (connection.isLoading || (connection.isError && !connection.data)) {
    return (
      <>
        {header}
        <Surface>
          <div className={styles.gate}><p className={styles.muted}>Checking Spotify…</p></div>
        </Surface>
      </>
    );
  }
  const gate =
    connection.data?.configured === false || reason === "not_configured"
      ? "not_configured"
      : reason === "needs_reconnect"
        ? "needs_reconnect"
        : !connected || reason === "not_connected"
          ? "not_connected"
          : null;
  if (gate) {
    return (
      <>
        {header}
        <Surface>
          <div className={styles.gate}><ConnectPrompt reason={gate} /></div>
        </Surface>
      </>
    );
  }

  const togglePin = (item: MusicItem) => {
    const pinned = pinnedUris.has(item.uri);
    if (!pinned && pins.length >= MAX_MUSIC_PINS) {
      toast({ message: `You can pin up to ${MAX_MUSIC_PINS}. Unpin one first.` });
      return;
    }
    const next = pinned ? pins.filter((p) => p.uri !== item.uri) : [...pins, item];
    updateSettings.mutate({ musicPins: next }, { onError: failed });
  };
  const activate = (item: MusicItem) => (editing ? togglePin(item) : play.mutate(item.uri, { onError: failed }));

  const needsScope = [recent.error, playlists.error].some((e) => e && musicErrorReason(e) === "missing_scope");

  return (
    <>
      {header}
      <div className={styles.page}>
        <MusicHero />

        <section className={styles.section} aria-label="Pinned">
          <div className={styles.sectionHead}>
            <h3 className={styles.sectionTitle}>Pinned</h3>
            {!needsScope ? (
              <button
                type="button"
                className={styles.editBtn}
                aria-pressed={editing}
                onClick={() => setEditing((v) => !v)}
              >
                {editing ? "Done" : "Edit"}
              </button>
            ) : null}
          </div>
          {editing ? (
            <p className={styles.hint}>
              Tap anything below to pin or unpin it ({pins.length}/{MAX_MUSIC_PINS}).
            </p>
          ) : null}
          {pins.length > 0 ? (
            <div className={styles.pins}>
              {pins.map((item) => (
                <Chip key={item.uri} item={item} editing={editing} onActivate={activate} />
              ))}
            </div>
          ) : (
            <button type="button" className={styles.pinEmpty} onClick={() => setEditing(true)}>
              Pin your go-to playlists and albums for one-tap play.
              <b>Choose pins</b>
            </button>
          )}
        </section>

        {needsScope ? (
          <section className={styles.notice} aria-label="Reconnect Spotify">
            <b>Reconnect Spotify to browse your music</b>
            <p>
              Telescreen now needs permission to read your recently played and playlists.{" "}
              <Link to="/settings" className={styles.linkBtn}>Open Settings</Link>
            </p>
          </section>
        ) : (
          <>
            <Shelf
              title="Recently played"
              query={recent}
              editing={editing}
              pinnedUris={pinnedUris}
              onActivate={activate}
              empty="Nothing played recently."
            />
            <Shelf
              title="Your playlists"
              query={playlists}
              editing={editing}
              pinnedUris={pinnedUris}
              onActivate={activate}
              empty="No playlists yet."
            />
          </>
        )}
      </div>
    </>
  );
}
