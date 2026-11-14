# Environment variables

Telescreen is configured entirely through environment variables. There is no
config file; the settings you change inside the app (household, members,
modules, weather location) are stored in the database and are separate.

`.env` in the repository root is used by `pnpm dev` / `pnpm start` and passed to
the container by `docker-compose.yml` (`env_file:`). Variables already set in
the environment win over `.env`. Restart the container after a change:

```bash
docker compose up -d
```

## Core

| Variable | Default | Purpose |
| --- | --- | --- |
| `TELESCREEN_DATA_DIR` | `./data` | Directory holding `telescreen.db`. Compose sets `/data` and mounts `./data` there. An empty value falls back to the default |
| `TELESCREEN_SECRET_KEY` | unset | 32-byte key (64 hex characters, or base64) for AES-256-GCM encryption of provider secrets. Required before connecting Google, iCloud, or Spotify. Generate with `openssl rand -hex 32` |
| `TELESCREEN_TRUST_NETWORK` | off | `1` or `true`: `/api/v1` requests without an `Authorization` header act as the household. A token that is sent is still verified. Only use on a private network |
| `TELESCREEN_TIMEZONE` | system zone, else `UTC` | IANA zone for the household. Applied only when the household is first seeded |
| `TELESCREEN_HOUSEHOLD_NAME` | `Our Home` | Household name. Applied only when the household is first seeded |
| `PORT` | `4000` | HTTP listen port. Compose sets `8788`. Non-numeric values fall back to 4000 |
| `HOST` | `0.0.0.0` | Bind address |
| `TELESCREEN_PUBLIC_URL` | `http://localhost:$PORT` | Public base URL as the browser reaches it. Used to build OAuth redirect URIs. Trailing slashes are stripped; include a non-443 port |

`TELESCREEN_SECRET_KEY` is not needed to boot, but the server logs a warning
when it is missing or invalid and any attempt to connect an account fails.
Losing the key makes stored tokens unreadable: reconnect every account after
changing it. See [Access and security](../host/security).

`TELESCREEN_HOUSEHOLD_NAME` and `TELESCREEN_TIMEZONE` are seed values. Changing
them later has no effect; edit the household in **Settings > Household >
General** instead. The time zone is stored per household.

## Google Calendar

| Variable | Default | Purpose |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | unset | OAuth client id. Unset hides Google and disables `POST /accounts/google/start` |
| `GOOGLE_CLIENT_SECRET` | unset | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `${TELESCREEN_PUBLIC_URL}/auth/google/callback` | Override when the URI registered in Google Cloud differs |

The scope is fixed in code (`https://www.googleapis.com/auth/calendar`,
read/write). See [Google Calendar](../connect/google).

## Spotify

| Variable | Default | Purpose |
| --- | --- | --- |
| `SPOTIFY_CLIENT_ID` | unset | Client id of your Spotify app. Unset disables the Music module's connection |
| `SPOTIFY_CLIENT_SECRET` | unset | Optional: the PKCE flow does not need it, but a Web-app client has one |
| `SPOTIFY_REDIRECT_URI` | `${TELESCREEN_PUBLIC_URL}/auth/spotify/callback` | Override when the URI registered in the Spotify dashboard differs |

See [Spotify](../connect/spotify).

## Meals (PantryPal)

| Variable | Default | Purpose |
| --- | --- | --- |
| `PANTRYPAL_URL` | unset | PantryPal base URL reached server-to-server, for example `http://pantrypal:8787`. Unset makes the Meals module unavailable |
| `PANTRYPAL_PUBLIC_URL` | value of `PANTRYPAL_URL` | Browser-facing PantryPal URL for recipe deep links |
| `PANTRYPAL_TOKEN` | unset | Optional bearer token sent to PantryPal. Leave unset when PantryPal runs with `PANTRYPAL_TRUST_NETWORK=1` |

Module enablement is a setting (`Settings > Modules > Meals`), not an
environment variable. See [PantryPal](../connect/pantrypal).

## Travel

| Variable | Default | Purpose |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | unset | API key with the Google Routes API enabled. Unset makes the Travel module unavailable |

See [Travel](../use/travel).

## Serving and development

| Variable | Default | Purpose |
| --- | --- | --- |
| `TELESCREEN_WEB_DIR` | `<package>/web/dist` | Directory of the built web app served at `/`. Without an `index.html` there, the server serves the API only |
| `TELESCREEN_API_URL` | `http://127.0.0.1:4000` | Development only. Vite dev server proxy target for `/api` |
| `ICLOUD_CALDAV_URL` | `https://caldav.icloud.com` | Test only. Overrides the CalDAV server so tests can use a fake. Leave unset in production |
| `NODE_ENV` | `production` in the image | Runtime mode set by the Dockerfile |

`E2E_PORT`, `FAKE_CALDAV_PORT`, and `CI` are read by the Playwright harness
(`playwright.config.ts`, `e2e/`), not by the server. `drizzle-kit` also reads
`TELESCREEN_DATA_DIR` for migrations.

## Deployment notes

- The container runs as uid 1000 (`node`). `./data` must be writable by that
  user.
- Compose publishes the port on `127.0.0.1` only and expects
  `tailscale serve --bg 8788` (or port `8444` with
  `tailscale serve --bg --https=8444 8788`) to expose it over the tailnet.
- `TELESCREEN_PUBLIC_URL` must be the URL the tablet uses, including any
  non-standard HTTPS port, or OAuth redirects will point at the wrong place.
- With `TELESCREEN_TRUST_NETWORK=1`, anyone who can reach the port is the
  household. Keep the port on loopback or the tailnet.

See [Configuration](../host/configuration) for how these fit together, and
[REST API](rest-api) for how tokens interact with trust mode.
