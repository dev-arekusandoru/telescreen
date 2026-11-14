import { MusicNotes, SpotifyLogo, Warning } from "@phosphor-icons/react";
import { useState } from "react";
import { errorMessage } from "@/api/errors";
import { useMusicConnection, useConnectSpotify, useDisconnectSpotify } from "@/features/music";
import { useSettings, useUpdateSettings } from "@/features/queries";
import { Switch, useToast } from "@/ui";
import layout from "./MusicSection.module.css";
import styles from "./Settings.module.css";

const STATUS_LABEL: Record<string, string> = {
  ok: "Connected",
  error: "Problem",
  needs_auth: "Reconnect needed",
};

/**
 * Settings > Music: enable the module, connect/disconnect the Spotify account
 * (OAuth PKCE through /auth/spotify/callback) and show its status.
 */
export function MusicSection() {
  const { data: settings } = useSettings();
  const updateSettings = useUpdateSettings();
  const { data: connection } = useMusicConnection();
  const connect = useConnectSpotify();
  const disconnect = useDisconnectSpotify();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);

  const enabled = settings?.modules.music ?? false;
  const connected = connection?.connected === true;
  const configured = connection?.configured === true;
  const status = connection?.status ?? null;

  const startConnect = () =>
    connect.mutate(undefined, {
      onSuccess: (authUrl) => window.location.assign(authUrl),
      onError: (error) => toast({ message: errorMessage(error) }),
    });

  const runDisconnect = () =>
    disconnect.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        toast({ message: "Spotify disconnected" });
      },
      onError: (error) => toast({ message: errorMessage(error) }),
    });

  return (
    <section className={styles.sec} aria-labelledby="music-h">
      <h2 id="music-h">Music</h2>

      <div className={styles.row}>
        <MusicNotes aria-hidden />
        <div>
          <b>Spotify</b>
          <small>Now playing card and the Music tab</small>
        </div>
        <div className={styles.end}>
          <Switch
            label="Music"
            checked={enabled}
            disabled={!settings || updateSettings.isPending}
            onCheckedChange={(on) => settings && updateSettings.mutate({ modules: { ...settings.modules, music: on } })}
          />
        </div>
      </div>

      <div className={styles.row}>
        <SpotifyLogo aria-hidden />
        <div className={layout.main}>
          <b>Spotify account</b>
          {connected ? (
            <small>{connection?.label ?? "Spotify"} · playback control on your Connect device</small>
          ) : configured ? (
            <small>Not connected. Telescreen only controls an already-open Spotify app.</small>
          ) : (
            <small>Not configured. Set SPOTIFY_CLIENT_ID in the environment and restart Telescreen.</small>
          )}
          {connection?.lastError ? (
            <small className={layout.warn} role="status">
              <Warning aria-hidden />
              <span>{connection.lastError}</span>
            </small>
          ) : null}
        </div>
        <span className={`${layout.badge}${status === "ok" ? "" : layout.badgeWarn}`}>
          {status ? STATUS_LABEL[status] ?? status : "Not connected"}
        </span>
        <div className={layout.actions}>
          {connected ? (
            confirming ? (
              <div className={layout.confirm}>
                <button type="button" className={layout.btn} onClick={() => setConfirming(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className={`${layout.btn} ${layout.danger}`}
                  disabled={disconnect.isPending}
                  onClick={runDisconnect}
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <button type="button" className={layout.btn} onClick={() => setConfirming(true)}>
                Disconnect
              </button>
            )
          ) : (
            <button
              type="button"
              className={layout.btn}
              disabled={!configured || connect.isPending}
              onClick={startConnect}
            >
              <SpotifyLogo aria-hidden /> {connect.isPending ? "Redirecting…" : "Connect Spotify"}
            </button>
          )}
        </div>
      </div>

      <p className={layout.hint}>
        Playback control requires Spotify Premium and a device that already plays Spotify (phone, speaker,
        computer). Telescreen never plays audio itself.
      </p>
    </section>
  );
}
