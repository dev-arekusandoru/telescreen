# Spotify

The Music module shows what is playing and controls playback on a Spotify
device you already have open. Telescreen never plays audio itself; the database
holds only an encrypted Spotify refresh token.

Spotify is optional: when `SPOTIFY_CLIENT_ID` is unset, **Settings > Modules >
Music** reports **Not configured**, **Connect Spotify** is disabled, and the
Music tab prompts you to connect. Enabling the module without credentials does
not hide the tab.

## Create the Spotify app

1. Open the [Spotify developer dashboard](https://developer.spotify.com/dashboard)
   and log in with the Spotify account that owns the playback device.
2. Choose **Create app**. Give it a name such as `Telescreen`, a description,
   and the redirect URI below. Select **Web API** when asked which APIs the app
   uses.
3. Open the app's **Settings** and add the redirect URI under **Redirect URIs**.
4. Copy the **Client ID**. The **Client secret** is optional for Telescreen.

## Redirect URI

Telescreen builds the redirect URI as
`${TELESCREEN_PUBLIC_URL}/auth/spotify/callback`, or uses
`SPOTIFY_REDIRECT_URI` when set.

| Situation | Redirect URI to add in Spotify |
| --- | --- |
| Tailnet HTTPS on port 443 | `https://machine.your-tailnet.ts.net/auth/spotify/callback` |
| Tailnet HTTPS on another port | `https://machine.your-tailnet.ts.net:8444/auth/spotify/callback` |
| Loopback fallback | `http://127.0.0.1:8788/auth/spotify/callback` |

Spotify requires HTTPS, with a loopback `http://127.0.0.1` address as the only
plain-HTTP exception. It must match the value Telescreen sends character for
character, including the port when it is not 443.

## Users and development mode

A Spotify app starts in **development mode**. In that mode, only Spotify
accounts you add under **User Management** in the dashboard can authorise it
(up to 25). Add the account whose device will play music, or the consent screen
rejects it.

Development mode also limits API use; normal household traffic is far below
the quota. To leave development mode, request an extension in the dashboard.

## Configure the server

Add the app credentials to `.env`:

```bash
TELESCREEN_PUBLIC_URL=https://machine.your-tailnet.ts.net
SPOTIFY_CLIENT_ID=your-client-id
# Optional: PKCE does not need it, but a Web app client has one.
SPOTIFY_CLIENT_SECRET=your-client-secret
# Only when the URI registered at Spotify differs from the default above:
# SPOTIFY_REDIRECT_URI=http://127.0.0.1:8788/auth/spotify/callback
```

Restart the container:

```bash
docker compose up -d
```

The OAuth flow is Authorization Code with PKCE, run on the server. The code
verifier is generated and kept there rather than exposed to the browser, and
the client secret is sent only if you set one.

## Connect the account

1. Open **Settings > Modules > Music** and turn on the **Music** switch. The
   Music tab appears in the navigation.
2. Tap **Connect Spotify**. The browser goes to Spotify's consent screen.
3. Approve the requested scopes. The browser returns to `/settings`, the
   Spotify account row shows the display name with a Connected badge, and
   now-playing data starts working.

Telescreen requests these scopes:

| Scope | Used for |
| --- | --- |
| `user-read-playback-state` | Now playing and the device list |
| `user-read-currently-playing` | The current track |
| `user-modify-playback-state` | Play, pause, skip, volume, device transfer |
| `user-read-recently-played` | Recently played albums |
| `playlist-read-private` | Your private playlists |
| `playlist-read-collaborative` | Playlists shared with you |

## Premium and devices

Playback control requires **Spotify Premium** on the connected account. Without
it, transport commands return `403 premium_required`.

Telescreen controls a Spotify Connect device that is already active: a phone,
computer, speaker, or TV with Spotify open. If nothing is active:

- Now playing returns an empty track.
- Play, pause, skip, and volume return `422 no_active_device`.
- Play album or playlist falls back to the first available Connect device, and
  fails with `422 no_active_device` when there is none.

Open Spotify somewhere first, then use the device picker in the Music tab to
move playback.

## Reconnect

Reconnect from **Settings > Modules > Music** when:

- The badge says **Reconnect needed** or the last error mentions revoked access.
- Recently played and playlists return `422 missing_scope`. Connections made
  before the library scopes existed must authorise the new scopes.
- You change the Spotify client or its redirect URI.

Tap **Disconnect**, then **Connect Spotify** again. Disconnecting forgets the
stored refresh token; nothing changes in the Spotify account.

## What is stored

- The refresh token, encrypted with AES-256-GCM using
  `TELESCREEN_SECRET_KEY`, in the music connection row of `telescreen.db`.
- The account's Spotify display name and status.
- Access tokens only in memory; they are refreshed automatically before expiry.

Rotating `TELESCREEN_SECRET_KEY` makes the stored token unreadable, so the
account must be connected again.

## Limits

- Telescreen cannot create a playback session from nothing; a device must be
  available.
- Ads, podcasts, and local files may show no album art or incomplete metadata.
- Spotify may rate-limit bursts of commands. The API then returns `503
  rate_limited` with `details.retryAfterSeconds`; wait that long and try again.

See [Music](../use/music) for the screen itself and
[Configuration](../host/configuration) for the variables.
