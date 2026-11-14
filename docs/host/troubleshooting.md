# Troubleshooting

Start with the container, then the network, then the app. Most problems announce
themselves in one of three places:

```bash
docker compose ps                        # is it running and healthy?
docker compose logs --tail=100 telescreen
curl -s http://127.0.0.1:8788/api/v1/health
```

The API returns errors as `{ "error": { "code": "...", "message": "..." } }`, and
the message is written to be read — it usually names the variable or setting to
change.

## Common problems

| Symptom | Check | Fix |
| --- | --- | --- |
| `ps` says healthy, the page does not load | `tailscale serve status`; is the URL's port the one you served? | Re-run `tailscale serve --bg 8788` or `--https=8444`, and open the matching URL from the tailnet device |
| Container restarts, log shows `SQLITE_CANTOPEN` | Ownership of `./data` | `sudo chown -R 1000:1000 data`, then `docker compose up -d` |
| Container logs `TELESCREEN_SECRET_KEY is not set or invalid` | Is the value 64 hex characters? | `openssl rand -hex 32`, paste into `.env`, `docker compose up -d --force-recreate`; existing accounts will need reconnecting |
| Connecting Google fails with `redirect_uri_mismatch` | Registered URI vs `TELESCREEN_PUBLIC_URL` | Both must be `${TELESCREEN_PUBLIC_URL}/auth/google/callback`, including a non-443 port; or set `GOOGLE_REDIRECT_URI` to the registered value |
| Account badge says "Reconnect needed" (iCloud) | App-specific password revoked or Apple ID password changed | Remove and re-add the account under **Settings > Calendar > Accounts** with a fresh app-specific password |
| Account badge says "Reconnect needed" (Spotify) | Token revoked, or the connection predates the library scopes (`missing_scope`) | **Settings > Modules > Music > Connect Spotify** again |
| Badge says "Sync problem" with a last error | Provider outage, expired credentials, or a write conflict | Tap sync now; if it persists, check the log and the provider's status page; reconnect if the error says auth |
| No weather card | Module enabled, location set, and `modules.weather` on | **Settings > Modules > Weather**: enable it, then "Use this device's location" over HTTPS or enter latitude/longitude |
| Weather shows old data | Cache is 15 minutes; upstream unreachable serves the last good response flagged stale | Confirm the server can reach `api.open-meteo.com`; no key is needed |
| Travel says "not configured" | `GOOGLE_MAPS_API_KEY` set, Routes API enabled on the key, home address saved | Set the key, enable Routes API, restart, then set a home address in **Settings > Modules > Travel** |
| Meals unavailable | `PANTRYPAL_URL` set, reachable from the container, module enabled | **Settings > Modules > Meals > Test connection** names the failure; see [Reaching PantryPal](deployment#reaching-pantrypal) |
| PantryPal hostname does not resolve | `PANTRYPAL_URL` uses a Docker name but no shared network | Use PantryPal's tailnet or LAN URL, or join its network with an override as in [Reaching PantryPal](deployment#reaching-pantrypal) |
| Meals says unauthorized | `PANTRYPAL_TOKEN` vs PantryPal's trust mode | Leave the token unset if PantryPal runs with `PANTRYPAL_TRUST_NETWORK=1`; otherwise use a valid token |
| Screen still sleeps | Address bar shows `http://` | Open the `https://` tailnet URL; the wake lock needs HTTPS, then enable **Settings > Household > General > Keep screen awake** |
| The PWA shows an old version | Service worker cached shell | Reload; if unchanged, close it from the app switcher and reopen; last resort, remove the home-screen icon and add it again |
| `tailscale serve` fails on port 443 | Something else holds 443 | `tailscale serve --bg --https=8444 http://127.0.0.1:8788`, then set `TELESCREEN_PUBLIC_URL=https://machine.tailnet.ts.net:8444` and update the provider redirect URI |
| Clock and events are in the wrong zone | Household time zone vs server zone | **Settings > Household > General > Time zone**. `TELESCREEN_TIMEZONE` only applies to a fresh database |
| API client gets `401 Missing or invalid API token` | A token is being sent and it is wrong or revoked | Create a new one with `pnpm cli token create <name>`; or clear `TELESCREEN_TRUST_NETWORK` expectations — trust mode ignores the header on no-header requests only |
| API client gets `401` with no header | Trust mode is off | Set `TELESCREEN_TRUST_NETWORK=1` for a private network, or send a bearer token |

## Reading the log

The boot sequence prints everything needed to confirm a configuration:

```
TELESCREEN_TRUST_NETWORK is on: /api/v1 requests without a token act as the household.
Telescreen listening on http://0.0.0.0:8788 (Our Home, Europe/Berlin)
Database: /data/telescreen.db
Serving web app from /app/web/dist
```

- No "Serving web app" line means the image was built without the Vite output —
  rebuild with `docker compose build`.
- The household name and zone in the listen line come from the database, not the
  environment, once the household exists.
- `Chore tick failed:` or `[telescreen] unhandled error:` precede a stack trace;
  include it when reporting a bug.

## Calendar sync specifics

- Sync runs every `syncIntervalMinutes` (5 by default) and on demand from the
  sidebar. A first sync after connecting an account can take a minute.
- iCloud change detection uses collection `ctag` then per-object `etag`; "no
  change" means no new events, not a broken sync.
- Writes go to the provider first, then the cache. A `409 conflict` means the
  remote event changed underneath you: reload and retry.
- Read-only shared calendars are not offered as write targets; pick a writable
  default under **Settings > Calendar > Calendars**.

## Still stuck

Reproduce with the log level visible (`docker compose logs -f telescreen`), then
open an issue with the version from `/api/v1/health`, the exact error text, and
what you changed last. Do not paste `TELESCREEN_SECRET_KEY`, tokens, or the
contents of the database.
