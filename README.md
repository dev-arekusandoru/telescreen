# HomeHub

Self-hosted family wall-calendar and chores for two people: a big color-coded calendar (Google and iCloud), recurring and rotating chores, optional weather, PantryPal meals and Spotify now-playing, light and dark themes. No cloud, no accounts. See [SPEC.md](SPEC.md); code layout in [ARCHITECTURE.md](ARCHITECTURE.md).

## Start using it

1. **Configure**: `cp .env.example .env`, then set `HOMEHUB_SECRET_KEY` (`openssl rand -hex 32`; keep it, losing it means reconnecting accounts), `HOMEHUB_TRUST_NETWORK=1` (the app is only reachable on your tailnet) and optionally `HOMEHUB_TIMEZONE`.
2. **Run**: `mkdir -p data && docker compose up -d --build` (serves `127.0.0.1:8788`, data in `./data`). Create `data/` yourself first: if Docker creates it, it is root-owned and the container (user `node`, uid 1000) cannot write the database. Fix an existing one with `sudo chown -R 1000:1000 data`. Check it is up with `docker compose ps` (healthy) and `curl http://127.0.0.1:8788/api/v1/health` before serving it.
3. **HTTPS on your tailnet**: `tailscale serve --bg 8788`, then open `https://<machine>.<tailnet>.ts.net`. If 443 is already taken by another app, use a separate HTTPS port: `tailscale serve --bg --https=8444 8788` and open `https://<machine>.<tailnet>.ts.net:8444`. Set `HOMEHUB_PUBLIC_URL` to that exact URL (including any port) in `.env` if you use Google.
4. **iCloud**: create an app-specific password at appleid.apple.com, then Settings > Accounts > Add iCloud ([details](#icloud)).
5. **Google**: create the OAuth client in your own Cloud project, add `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` to `.env`, `docker compose up -d`, then Settings > Accounts > Add Google ([steps](#google)).
6. **Spotify** (optional): create a Spotify app, add `SPOTIFY_CLIENT_ID` to `.env`, restart, then Settings > Music > **Connect Spotify** ([steps](#spotify-music)).
7. **Assign calendars**: Settings > Calendars, give each calendar to Alex, Vale or Family/Both.
8. **iPad**: open the URL in Safari > Share > **Add to Home Screen**. Enable *Keep screen awake* in Settings > General for wall use.
9. **Meals** (optional): run PantryPal on the same host or tailnet, set `PANTRYPAL_URL`, then enable Settings > Meals ([details](#meals-pantrypal)).
10. **Weather** (optional): enable Settings > Weather, then use *Use this device's location* or enter latitude/longitude ([details](#weather)).
11. **Travel** (optional): set `GOOGLE_MAPS_API_KEY`, restart, then enable Settings > Travel and add a home address and destinations ([details](#travel)).
12. Back up by copying `./data`.


## Develop

Requires Node >= 22 and pnpm.

```sh
pnpm install
cp .env.example .env          # optional; `pnpm dev` loads it automatically
pnpm dev                      # API on http://localhost:4000 (data in ./data)
pnpm web:dev                  # Vite dev server on :4001, proxies /api to :4000
```

Dev ports live in the 4000 range so they never collide with the deployed instance on :8788.

Other commands: `pnpm typecheck`, `pnpm test` (server), `pnpm test:web`, `pnpm build`, `pnpm start` (serves API + built web on :4000), `pnpm db:generate` (after schema edits), `pnpm openapi` (regenerate the web API client), `pnpm e2e` (Playwright smoke at 1180x820 and 390x844; first run `pnpm e2e:install`; builds the web and starts a throwaway server on :4010).

PWA: `web/public/manifest.webmanifest`, `sw.js` (app-shell only, never caches `/api`) and `web/public/icons/` (regenerate with `node scripts/generate-icons.mjs`). Install from Safari over the tailscale HTTPS URL (Share > Add to Home Screen). The screen wake lock also needs HTTPS and is toggled in Settings > General.

On first boot HomeHub creates the household (time zone from `HOMEHUB_TIMEZONE`, else the system zone) and two members, Alex and Vale; rename and recolor them in Settings.

## Configuration

| Variable | Default | |
|---|---|---|
| `HOMEHUB_DATA_DIR` | `./data` | SQLite file `homehub.db` lives here |
| `HOMEHUB_SECRET_KEY` | | 32 bytes as 64 hex chars; encrypts provider secrets (`openssl rand -hex 32`) |
| `HOMEHUB_TRUST_NETWORK` | off | `1`: `/api/v1` works without a token (private networks only); a sent token is still verified |
| `HOMEHUB_TIMEZONE` | system | IANA zone for the household on first boot |
| `HOMEHUB_PUBLIC_URL` | `http://localhost:${PORT}` | Base URL the browser uses to reach HomeHub (your tailnet HTTPS URL); builds the Google redirect URI |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | OAuth client from your own Google Cloud project; Google stays unavailable until both are set |
| `GOOGLE_REDIRECT_URI` | `${HOMEHUB_PUBLIC_URL}/auth/google/callback` | Only if the URI registered in Google Cloud differs |
| `SPOTIFY_CLIENT_ID` | | Client id from your own Spotify app; Music stays disabled until set |
| `SPOTIFY_CLIENT_SECRET` | | Optional: the PKCE flow does not require it, but a Web-app client has one |
| `SPOTIFY_REDIRECT_URI` | `${HOMEHUB_PUBLIC_URL}/auth/spotify/callback` | Only if the URI registered in Spotify differs |
| `PANTRYPAL_URL` | | PantryPal server base URL (server-to-server); the Meals module stays unavailable until set |
| `PANTRYPAL_PUBLIC_URL` | `PANTRYPAL_URL` | Browser-facing PantryPal URL for recipe deep links |
| `PANTRYPAL_TOKEN` | | Optional bearer token; omit when PantryPal runs with `PANTRYPAL_TRUST_NETWORK=1` |
| `GOOGLE_MAPS_API_KEY` | | Google Cloud API key with the Routes API enabled; the Travel module stays unavailable until set |
| `PORT` / `HOST` | `4000` / `0.0.0.0` | docker compose sets `8788` |

Without trust mode, create a bearer token: `pnpm cli token create <name>`.

## Connecting calendars

Settings > Accounts. The server polls every *Sync interval* (Settings > General, default 5 min), and the app triggers a sync when it regains focus. Events are cached in SQLite; recurring events are expanded server-side. Writes go to the provider first, then the cache; if the event changed elsewhere in the meantime you get "This event changed elsewhere" (HTTP 409) instead of an overwrite.

### iCloud

1. Sign in at <https://appleid.apple.com> > Sign-In and Security > **App-Specific Passwords** and create one named "HomeHub".
2. Settings > Accounts > **Add iCloud**: enter your Apple ID and that password. (Your normal Apple ID password does not work.)

HomeHub talks CalDAV to `caldav.icloud.com`. Subscribed calendars are read-only. If Apple revokes the password the account shows "Reconnect needed": remove it and add it again.

### Google

Google needs an OAuth client from a Cloud project you own (about five minutes, free):

1. <https://console.cloud.google.com> > create a project, then **APIs & Services > Library > Google Calendar API > Enable**.
2. **OAuth consent screen** (Google Auth Platform > Branding/Audience): user type *External*, fill in the app name and your email, add scope `.../auth/calendar`. Then set the publishing status to **In production** (Audience > *Publish app*). In "Testing" status refresh tokens expire after 7 days and the calendar would disconnect weekly. You do not need Google verification for personal use; you will see an "unverified app" warning once (Advanced > Go to HomeHub).
3. **Credentials > Create credentials > OAuth client ID**, type *Web application*. Add an **Authorized redirect URI**:
   - Preferred: `https://<machine>.<tailnet>.ts.net/auth/google/callback` (your `tailscale serve` URL; include the port, e.g. `:8444`, if you serve on a non-443 HTTPS port). Google accepts it if the domain is a public suffix it can resolve; if the console rejects it, use option 2.
   - Fallback: `http://localhost:8788/auth/google/callback`. Set `GOOGLE_REDIRECT_URI` to exactly that, and do the one-time connect from a browser on the HomeHub host (or `ssh -L 8788:localhost:8788 <host>` from your laptop, then open `http://localhost:8788/settings`). After the token is stored the redirect is never used again.
4. Put the client id and secret in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, plus `HOMEHUB_PUBLIC_URL` for option 1) and restart.
5. Settings > Accounts > **Add Google** and grant access. HomeHub stores only the refresh token, encrypted with `HOMEHUB_SECRET_KEY`.

Google calendars with the *Reader* role (holidays, shared read-only) are read-only in HomeHub.

## Spotify (Music)

Spotify needs an app in your own Spotify developer account (free, about five minutes). HomeHub uses **Authorization Code with PKCE**, keeps the refresh token encrypted server-side, and controls playback on a Spotify Connect device that is already open. Playback control requires **Spotify Premium** (already confirmed for this household).

1. <https://developer.spotify.com/dashboard> > **Create app**. Pick any name and description; set the **Redirect URI** exactly (Spotify rejects plain `http://` except loopback addresses):
   - Preferred: `https://<machine>.<tailnet>.ts.net/auth/spotify/callback` (your `tailscale serve` URL; include the port, e.g. `:8444`, if you serve on a non-443 HTTPS port).
   - Fallback: `http://127.0.0.1:8788/auth/spotify/callback`. Set `SPOTIFY_REDIRECT_URI` to exactly that and do the one-time connect from a browser on the HomeHub host (or `ssh -L 8788:127.0.0.1:8788 <host>` from your laptop). After the token is stored the redirect is never used again.
2. In the app's **Settings**, tick **Web API** under *APIs used*, then **Save**. Under **User Management**, add the Spotify account's email address (development mode limits the app to the listed users; request an extension from Spotify if you need more).
3. Put `SPOTIFY_CLIENT_ID` (and `SPOTIFY_CLIENT_SECRET` if the app shows one) in `.env`, plus `HOMEHUB_PUBLIC_URL` for the preferred redirect, and restart.
4. Enable **Settings > Music**, then **Connect Spotify** and grant the scopes it asks for (playback state and control, recently played, and your playlists). If you connected before the Music page gained recents and playlists, reconnect once so Spotify grants the new read scopes; playback keeps working until then.

Start playback once in the Spotify app on your phone, speaker or computer; HomeHub's now-playing card and Music tab then show the track, progress and the active device, with play/pause/skip, volume and a device picker. Without an active device the card offers the picker. If Spotify rejects the stored token, Settings > Music shows *Reconnect needed*.

## Weather

Weather uses [Open-Meteo](https://open-meteo.com) (free, no API key or account) for the location set in Settings > Weather: click **Use this device's location** (needs HTTPS, e.g. the tailscale URL) or enter latitude/longitude, pick °C/°F and an optional place label. At 1280px and wider the right column shows a weather card with a Daily/Hourly switch; below that the calendar header gets a temperature chip (tap for the same card) plus an **At a glance** button that opens the hidden right-column widgets. Below 960px the chip folds into that popup so the header stays on one row.

The server caches forecasts for 15 minutes, so requests never hit Open-Meteo per page load. When Open-Meteo is unreachable the last cached forecast is served marked as stale; without a cache the header chip stays hidden, the card shows *Unavailable*, and calendars keep working.

## Travel

The right-column Travel card (below weather) shows the driving time with live traffic from your home address to every saved destination, plus how many minutes traffic adds when that is two or more. Tapping a row opens Google Maps directions. In Google Cloud, enable the **Routes API**, create an API key (restrict it to that API), put it in `GOOGLE_MAPS_API_KEY` and restart. Then enable Settings > Travel, enter the home address and add destinations (a name like "Work" plus a free-text address; up to 20).

The server makes one `computeRouteMatrix` request for all destinations and caches it for 10 minutes, so a wall display left on all day uses about 144 matrix calls (one element per destination each). When Google fails the last result is shown marked *Last known*; a destination Google cannot route shows *No route*.

## Meals (PantryPal)

The Meals tab and the right-column "Tonight" card read PantryPal's current-week plan (`GET /api/v1/plans/current`) server-to-server, cached for five minutes. Point `PANTRYPAL_URL` at the PantryPal server (for example `http://pantrypal:8787` on the same Docker network or `http://<host>:8787` on the tailnet). If the browser reaches PantryPal at a different address (a tailnet HTTPS URL), set `PANTRYPAL_PUBLIC_URL` so recipe links work. On a trusted tailnet run PantryPal with `PANTRYPAL_TRUST_NETWORK=1`; otherwise create a token (`pnpm cli token create <name>` in PantryPal) and set `PANTRYPAL_TOKEN`.

The Calendar's Week and Day views also show that plan: a fixed-height strip under the day columns lists each day's meals (a colored Breakfast/Lunch/Dinner badge plus the recipe name; the third row becomes "+N more" on busy days). Tapping a meal opens the recipe in PantryPal, and tapping a day without meals opens that week's plan (`/?week=...`). Month and Schedule show no meals, and with PantryPal unreachable the strip simply disappears: the calendar never waits on it.

Then enable the module in Settings > Meals and use **Test connection**. When PantryPal is down the last good plan is shown marked "Last known plan"; with no cached plan the card and tab say Unavailable. Meals are read-only from HomeHub.

The Meals tab itself is built for the wall display: a hero card with the next meal to cook, a swipeable week strip (Breakfast/Lunch/Dinner per day) and a sidebar with the shopping list grouped by aisle, "missing for this week" pantry gaps and food expiring within five days. Those reads come from `/api/v1/shopping-lists`, `/api/v1/pantry/availability` and `/api/v1/pantry`, refreshed every five minutes and cached server-side like the plan; recipe photos and total times come from `/api/v1/recipes/{id}` (cached an hour, a missing photo falls back to a tinted placeholder).

## Deploy (Docker + Tailscale)

```sh
cp .env.example .env          # set HOMEHUB_SECRET_KEY
mkdir -p data                 # must be writable by uid 1000 (the container's `node` user)
docker compose up -d --build  # serves on 127.0.0.1:8788, data in ./data
tailscale serve --bg 8788     # HTTPS on your tailnet (needed for the screen wake lock)
# 443 already used by another app? Serve on another HTTPS port instead:
# tailscale serve --bg --https=8444 8788   → https://<machine>.<tailnet>.ts.net:8444
```

Updating: `git pull && docker compose up -d --build`; migrations run on boot.

## License

MIT
