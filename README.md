# HomeHub

Self-hosted family wall-calendar and chores for two people: a big color-coded calendar (Google and iCloud), recurring and rotating chores, light and dark themes. No cloud, no accounts. See [SPEC.md](SPEC.md); code layout in [ARCHITECTURE.md](ARCHITECTURE.md).

## Start using it

1. **Configure**: `cp .env.example .env`, then set `HOMEHUB_SECRET_KEY` (`openssl rand -hex 32`; keep it, losing it means reconnecting accounts), `HOMEHUB_TRUST_NETWORK=1` (the app is only reachable on your tailnet) and optionally `HOMEHUB_TIMEZONE`.
2. **Run**: `mkdir -p data && docker compose up -d --build` (serves `127.0.0.1:8788`, data in `./data`). Create `data/` yourself first: if Docker creates it, it is root-owned and the container (user `node`, uid 1000) cannot write the database. Fix an existing one with `sudo chown -R 1000:1000 data`. Check it is up with `docker compose ps` (healthy) and `curl http://127.0.0.1:8788/api/v1/health` before serving it.
3. **HTTPS on your tailnet**: `tailscale serve --bg 8788`, then open `https://<machine>.<tailnet>.ts.net`. If 443 is already taken by another app, use a separate HTTPS port: `tailscale serve --bg --https=8444 8788` and open `https://<machine>.<tailnet>.ts.net:8444`. Set `HOMEHUB_PUBLIC_URL` to that exact URL (including any port) in `.env` if you use Google.
4. **iCloud**: create an app-specific password at appleid.apple.com, then Settings > Accounts > Add iCloud ([details](#icloud)).
5. **Google**: create the OAuth client in your own Cloud project, add `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` to `.env`, `docker compose up -d`, then Settings > Accounts > Add Google ([steps](#google)).
6. **Assign calendars**: Settings > Calendars, give each calendar to Alex, Vale or Family/Both.
7. **iPad**: open the URL in Safari > Share > **Add to Home Screen**. Enable *Keep screen awake* in Settings > General for wall use.
8. Back up by copying `./data`.


## Develop

Requires Node >= 22 and pnpm.

```sh
pnpm install
cp .env.example .env          # optional; export the vars or use `node --env-file`
pnpm dev                      # API on http://localhost:8788 (data in ./data)
pnpm web:dev                  # Vite dev server, proxies /api to :8788
```

Other commands: `pnpm typecheck`, `pnpm test` (server), `pnpm test:web`, `pnpm build`, `pnpm start` (serves API + built web on :8788), `pnpm db:generate` (after schema edits), `pnpm openapi` (regenerate the web API client), `pnpm e2e` (Playwright smoke at 1180x820 and 390x844; first run `pnpm e2e:install`; builds the web and starts a throwaway server on :8799).

PWA: `web/public/manifest.webmanifest`, `sw.js` (app-shell only, never caches `/api`) and `web/public/icons/` (regenerate with `node scripts/generate-icons.mjs`). Install from Safari over the tailscale HTTPS URL (Share > Add to Home Screen). The screen wake lock also needs HTTPS and is toggled in Settings > General.

On first boot HomeHub creates the household (time zone from `HOMEHUB_TIMEZONE`, else the system zone) and two members, Alex and Vale; rename and recolor them in Settings.

## Configuration

| Variable | Default | |
|---|---|---|
| `HOMEHUB_DATA_DIR` | `./data` | SQLite file `homehub.db` lives here |
| `HOMEHUB_SECRET_KEY` | | 32 bytes as 64 hex chars; encrypts provider secrets (`openssl rand -hex 32`) |
| `HOMEHUB_TRUST_NETWORK` | off | `1`: `/api/v1` works without a token (private networks only); a sent token is still verified |
| `HOMEHUB_TIMEZONE` | system | IANA zone for the household on first boot |
| `HOMEHUB_PUBLIC_URL` | `http://localhost:8788` | Base URL the browser uses to reach HomeHub (your tailnet HTTPS URL); builds the Google redirect URI |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | | OAuth client from your own Google Cloud project; Google stays unavailable until both are set |
| `GOOGLE_REDIRECT_URI` | `${HOMEHUB_PUBLIC_URL}/auth/google/callback` | Only if the URI registered in Google Cloud differs |
| `PORT` / `HOST` | `8788` / `0.0.0.0` | |

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
