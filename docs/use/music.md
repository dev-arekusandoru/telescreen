# Music

Music shows what is playing on Spotify and lets you control it from the tablet. Telescreen never plays audio itself: it talks to a Spotify device that is already open in the room, such as a phone, speaker or computer.

## Before you start

- Your own Spotify app: set `SPOTIFY_CLIENT_ID` (and `SPOTIFY_CLIENT_SECRET` if the app is a Web app). See [Spotify](../connect/spotify).
- Connect the account in **Settings > Modules > Music**.
- Turn on **Settings > Modules > Music** to show the tab and the card.
- Playback control requires Spotify Premium. Without it, browsing works and commands fail with a "Premium required" message.

## The Music tab

The tab opens with the now-playing hero at the top: album cover, title, artists and a progress bar with elapsed and total time. The transport has previous, play/pause and next. While nothing plays, the hero reads "Nothing playing" ("Unavailable" when Spotify cannot be reached) and hides the transport.

Below the hero:

| Section | Contents |
|---|---|
| Pinned | Up to six albums, playlists or artists as one-tap chips. **Edit** switches the shelves into pin mode; tapping an item then pins or unpins it instead of playing. With nothing pinned, a prompt offers **Choose pins**. |
| Recently played | Up to twelve distinct entries from your play history, newest first. A play started from a playlist, Liked Songs or an artist shows as that context rather than the album; anything else shows its album. |
| Your playlists | Up to fifty of your playlists, preceded by **Liked Songs**. |

Tapping an album, playlist or pin starts it on the active device. With nothing active, it falls back to the first available device Spotify reports; with no device at all, the request fails and a toast says so.

If the account was connected before the library permissions existed, the page asks you to reconnect and hides the two shelves. Reconnecting from Settings fixes it.

## The now-playing card

On wide screens the right column carries an album-art card, below the Tonight card. It shows cover, title, artist and a thin progress line. A tap or a mouse hover reveals previous, play/pause and next; the controls hide again after ten seconds of inactivity. Tapping anywhere else opens the Music tab, or Settings when the account needs attention. Its states:

| State | Text |
|---|---|
| Server has no client id | "Spotify not set up" |
| Disconnected | "Connect Spotify" — tap opens Settings |
| Token rejected | "Reconnect Spotify" — tap opens Settings |
| Connected, no track | "Nothing playing" — start Spotify on any device |
| Poll fails | "Unavailable" |

## What you can control

- **Play/pause** — resumes or pauses the active device.
- **Previous / next** — skip within the current context.

Volume and device switching exist in the API (`PUT /music/volume`, `PUT /music/device`) but have no controls on screen yet; use the Spotify app for those. See [REST API](../reference/rest-api).

## No active device

When nothing is open or nothing has played recently, Spotify has no active device and returns no track: the card reads "Nothing playing". Play, pause and skip then fail with "No active Spotify device. Start playback in the Spotify app first."

To bring a device back, open Spotify on a phone, speaker or computer and play something; the card picks it up within a few seconds. Starting an album, playlist or pin from the tab also works, because Telescreen falls back to the first available device.

## Reconnect needed

Spotify can stop accepting the stored token — for example after you remove Telescreen from the apps connected to your account. Telescreen then refuses commands and marks the connection `needs_auth`. **Settings > Modules > Music** shows the status badge (**Connected**, **Problem** or **Reconnect needed**) and the last error under the account row. Use **Disconnect** and then **Connect Spotify** to grant access again; Disconnect only forgets the stored token and changes nothing in your Spotify account.

## Where your Spotify login lives

Connecting goes through Spotify's authorization-code flow with PKCE, on the server. Spotify returns an access token (one hour) and a refresh token; both are stored encrypted in the database with the key from `TELESCREEN_SECRET_KEY`, and access tokens are refreshed on the server. The browser never sees a token. Keep that key with your backups — without it, the connection cannot be decrypted and you will have to connect Spotify again.

## Refresh rate

Playback is polled every five seconds while a track is playing, every twenty seconds when idle, and every sixty seconds when the tab is hidden. Progress advances locally between polls, so the bar does not jump.
