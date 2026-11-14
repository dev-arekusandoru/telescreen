# Configuration

Telescreen is configured with environment variables and a data directory. There
is no configuration file and no admin panel for host settings. Variables are read
at boot, so a change needs a container restart.

The full list with types and defaults is in
[Environment variables](../reference/environment). This page covers how the
settings group together and what they affect.

## Persistence and access

| Variable | Default | Meaning |
| --- | --- | --- |
| `TELESCREEN_DATA_DIR` | `./data` (`/data` in the image) | Directory holding `telescreen.db` and its WAL files |
| `TELESCREEN_SECRET_KEY` | unset | 32-byte key, 64 hex chars or base64, encrypting stored provider secrets |
| `TELESCREEN_TRUST_NETWORK` | off | `1` or `true` lets `/api/v1` requests without a token act as the household |
| `TELESCREEN_TIMEZONE` | system zone | IANA zone stamped on the household at first boot only |
| `TELESCREEN_HOUSEHOLD_NAME` | `Our Home` | Household name at first boot only |
| `TELESCREEN_PUBLIC_URL` | `http://localhost:$PORT` | Base URL for OAuth redirects, as the browser reaches it |
| `PORT` | `4000` (`8788` in the image) | HTTP listen port |
| `HOST` | `0.0.0.0` | HTTP bind address |

`TELESCREEN_TIMEZONE` and `TELESCREEN_HOUSEHOLD_NAME` are consumed by the seeding
step, which runs only when no household exists. Change the time zone or name
afterwards in **Settings > Household > General** — that writes to the database and
wins.

Without a valid `TELESCREEN_SECRET_KEY` the server still starts, but connecting a
calendar account fails and the log warns about it. See
[Access and security](security).

## Calendar providers

| Variable | Default | Meaning |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` | unset | OAuth client id; Google stays hidden when empty |
| `GOOGLE_CLIENT_SECRET` | unset | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | `${TELESCREEN_PUBLIC_URL}/auth/google/callback` | Override only when the registered URI differs |
| `ICLOUD_CALDAV_URL` | `https://caldav.icloud.com` | CalDAV base; exists for the end-to-end test server, leave unset |

iCloud needs no environment variables: the Apple ID and app-specific password are
entered in the UI and stored encrypted.

## Modules

| Variable | Default | Meaning |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | unset | Key with the Routes API enabled; Travel unavailable without it |
| `PANTRYPAL_URL` | unset | PantryPal base URL, reached server-to-server; Meals unavailable without it |
| `PANTRYPAL_PUBLIC_URL` | `PANTRYPAL_URL` | Browser-facing URL for recipe deep links |
| `PANTRYPAL_TOKEN` | unset | Optional bearer token; leave unset when PantryPal trusts the network |
| `SPOTIFY_CLIENT_ID` | unset | Client id of your own Spotify app; Music unavailable without it |
| `SPOTIFY_CLIENT_SECRET` | unset | Optional for PKCE; a Web app client has one |
| `SPOTIFY_REDIRECT_URI` | `${TELESCREEN_PUBLIC_URL}/auth/spotify/callback` | Override only when the registered URI differs |

Weather has no environment variables. Its location, units, place label, and UV
toggle live in the database under **Settings > Modules > Weather**. Travel's home
address and destinations are also in Settings, not in the environment.

A module flag in Settings decides whether the feature is on; the environment
variable decides whether it *can* work. Meals stays switchable but reports "not
configured" until `PANTRYPAL_URL` is set and the container restarted.

## OAuth redirects

Both OAuth flows are server-side and derive their redirect URI the same way:

1. `GOOGLE_REDIRECT_URI` / `SPOTIFY_REDIRECT_URI` if set.
2. Otherwise `${TELESCREEN_PUBLIC_URL}/auth/google/callback` or
   `${TELESCREEN_PUBLIC_URL}/auth/spotify/callback`.
3. With `TELESCREEN_PUBLIC_URL` unset, `http://localhost:${PORT}` is used, which
   only works for a local development instance.

The redirect URI you register with the provider must match byte for byte,
including scheme, port, and trailing slash. On a non-443 tailscale port, include
the port in `TELESCREEN_PUBLIC_URL`:

```bash
TELESCREEN_PUBLIC_URL=https://machine.your-tailnet.ts.net:8444
```

## Development-only variables

| Variable | Meaning |
| --- | --- |
| `TELESCREEN_WEB_DIR` | Directory of the built web app; defaults to `web/dist` under the package root |
| `TELESCREEN_API_URL` | Target of the Vite dev-server `/api` proxy (default `http://127.0.0.1:4000`) |
| `NODE_ENV` | `production` in the image; leave it alone |

## Storage layout

Everything persistent lives in the data directory:

| Path | Contents |
| --- | --- |
| `telescreen.db` | The whole database: household, members, cached events, chores, settings, tokens, encrypted provider secrets |
| `telescreen.db-wal` | Write-ahead log; must be copied or checkpointed with the database |
| `telescreen.db-shm` | Shared-memory file for the WAL; regenerated on open |

Migrations in the image's `drizzle/` folder are applied on every boot, so starting
a newer image upgrades the schema in place. There is no migration UI and no
downgrade path: a schema newer than the code will not run.

The database file itself is **not encrypted**. Provider secrets inside it —
Google refresh tokens, the iCloud app-specific password, the Spotify refresh
token — are individually encrypted with AES-256-GCM using
`TELESCREEN_SECRET_KEY`, which means a stolen database file is only as useful as
the key it was encrypted with. Back up both, and store them apart. See
[Backups and restore](backups).

## Applying a change

```bash
docker compose up -d --force-recreate   # picks up .env changes
docker compose logs -f telescreen       # confirm the startup lines
```

The boot log prints the listen address, the household name and time zone, and the
database path — a quick way to confirm that `TELESCREEN_DATA_DIR` and
`TELESCREEN_TIMEZONE` took effect.
