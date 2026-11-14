# REST API

Telescreen serves a JSON API under `/api/v1`. The web app uses the same API, so
anything the wall can do is scriptable. An OpenAPI 3.1 document is generated
from the running server at `/openapi.json`.

## Base URL and authentication

Requests go to the address you use in the browser:

```bash
TELESCREEN_URL=https://machine.your-tailnet.ts.net
```

Every route except `/api/v1/health` requires authentication:

- **Bearer token.** Create one with the [CLI](cli):
  `Authorization: Bearer ts_...`. Tokens are stored SHA-256 hashed; the plain
  value is shown once at creation.
- **Network trust.** When the server runs with `TELESCREEN_TRUST_NETWORK=1`, a
  request with no `Authorization` header acts as the household. A header that
  is sent is still verified, so an invalid token returns `401` even in trust
  mode. Only enable this on a private network.

Send and receive JSON. Request bodies with a JSON content type.

```bash
curl -s "$TELESCREEN_URL/api/v1/health"
# {"ok":true,"version":"0.1.0"}

curl -s -H "Authorization: Bearer $TOKEN" "$TELESCREEN_URL/api/v1/household"
```

## Errors

Failures use one envelope:

```json
{ "error": { "code": "not_found", "message": "Account not found" } }
```

`details` is added when the error carries structured information, for example
the Zod issues for a validation failure or `retryAfterSeconds` for a rate limit.

| HTTP | `code` | Meaning |
| --- | --- | --- |
| 400 | `validation` | Body, query, or path failed validation; `details` lists the issues |
| 401 | `unauthorized` | Missing, invalid, or revoked token |
| 403 | `forbidden` | The calendar is read-only, or Spotify requires Premium |
| 404 | `not_found` | Unknown id, or the module is disabled |
| 409 | `conflict` | The event changed at the provider (etag precondition failed) |
| 422 | `unprocessable` | Understood but not actionable: not configured, `no_active_device`, `missing_scope`, `needs_reconnect` |
| 502 | `provider_error` | Google, Apple, or Spotify failed the request |
| 503 | `unavailable` | Module not configured, provider unreachable with no cache, or rate limited |

## Conventions

- Dates in chore and meal endpoints are `YYYY-MM-DD` in the household time zone.
- Event instants are ISO 8601 UTC strings. All-day events use `YYYY-MM-DD` with
  an exclusive end.
- Ids are opaque strings. Store and send them as received.
- Recurring events are expanded server-side (`RRULE`, `EXDATE`, overrides).
  `id` identifies one instance; `eventId` identifies the series.
- There is no pagination: range endpoints take explicit windows.

## Health

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness and version. Public, no token. Returns `{ ok, version }` |

## Household

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/household` | The household: id, name, timezone, week start, default theme |
| PATCH | `/household` | Update any of `name`, `timezone`, `weekStart` (0–6), `themeDefault` (`system`, `light`, `dark`) |

## Members

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/members` | Members ordered by `sort` |
| POST | `/members` | Create: `name`, `colorToken`, optional `initial` |
| PATCH | `/members/{id}` | Update name, colour, initial, or sort |
| DELETE | `/members/{id}` | Delete the member |

`colorToken` is one of `terracotta`, `sage`, `ochre`, `plum`, `slate`,
`rose`.

## Settings

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/settings` | All settings with defaults applied |
| PUT | `/settings` | Replace the keys you send; omitted keys keep their value |

Settings include `weekMode`, `idleReturnMinutes`, `syncIntervalMinutes`,
`keepAwake`, `seasonalDecor`, `modules` (weather, meals, music, travel),
`defaultWriteCalendarId`, `weather`, `musicPins`, and `travel`.

## Chores and occurrences

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/chores` | Chore templates, archived included |
| POST | `/chores` | Create a chore |
| PATCH | `/chores/{id}` | Update or archive a chore; history is kept |
| DELETE | `/chores/{id}` | Delete a chore and its history |
| GET | `/chore-occurrences` | Occurrences in a range; materialized on demand |
| GET | `/chore-occurrences/progress` | Done/total per member for one date |
| POST | `/chore-occurrences/{id}/complete` | Mark done; body `{ "completedBy": "mem_..." }` |
| POST | `/chore-occurrences/{id}/undo` | Reopen a done or skipped occurrence |
| POST | `/chore-occurrences/{id}/skip` | Skip an open occurrence |
| POST | `/chore-occurrences/{id}/reassign` | Override one occurrence's assignee; body `{ "memberId": "mem_..." }` |

Query parameters:

| Endpoint | Parameters |
| --- | --- |
| `GET /chore-occurrences` | `from` and `to` (required, `YYYY-MM-DD`), `member` (optional id), `carryover=true` to include still-open earlier occurrences |
| `GET /chore-occurrences/progress` | `date` (required, `YYYY-MM-DD`) |

Occurrence status is `open`, `done`, `missed`, or `skipped`. Assignment is
`fixed`, `rotating`, or `either`.

```bash
curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"completedBy":"mem_2p9q1r2s3t4u5v6w"}' \
  "$TELESCREEN_URL/api/v1/chore-occurrences/occ_5v6w7x8y9z2a3b4c/complete"
```

## Calendar accounts and sync

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/accounts` | Connected accounts; credentials are never included |
| POST | `/accounts/icloud` | Connect iCloud: `label`, `appleId`, `appPassword` |
| POST | `/accounts/google/start` | Return the Google consent URL to open |
| DELETE | `/accounts/{id}` | Disconnect and drop cached calendars and events (204) |
| POST | `/accounts/{id}/sync` | Sync one account now |
| POST | `/sync` | Sync every account now |
| GET | `/sync/status` | `{ lastSyncedAt, hasErrors }` for the header indicator |

`POST /accounts/google/start` and `POST /music/connect/start` return
`{ "authUrl": "..." }`. Open that URL in a browser; the flow finishes at the
callback routes below, not through the API.

## Calendars

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/calendars` | Discovered calendars with account, colour, writable flag, member mapping |
| PATCH | `/calendars/{id}` | Set `enabled` and/or `memberId` (`null` = Family / Both) |

## Events

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/events` | Expanded event instances in a window |
| POST | `/events` | Create an event; writes to the provider first |
| PATCH | `/events/{id}` | Edit an event or one occurrence |
| DELETE | `/events/{id}` | Delete an event or one occurrence (204) |

| Endpoint | Parameters |
| --- | --- |
| `GET /events` | `start` and `end` (required ISO instants, end exclusive), `members` (comma-separated ids; `family` selects unassigned calendars) |
| `PATCH`, `DELETE /events/{id}` | `scope=this` or `scope=all` (default `all`) |

Create body: `calendarId`, `title`, `start`, `end`, `allDay`, optional
`location`, `notes`, and `repeat` (`none`, `daily`, `weekdays`, `weekly`,
`monthly`, `yearly`, `custom`).

```bash
curl -s -H "Authorization: Bearer $TOKEN" \
  "$TELESCREEN_URL/api/v1/events?start=2026-11-14T00:00:00Z&end=2026-11-21T00:00:00Z&members=family"

curl -s -X POST -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"calendarId":"cal_8f3k2m9p0q1r2s3t","title":"Dentist","start":"2026-11-16T09:00:00Z","end":"2026-11-16T10:00:00Z","allDay":false}' \
  "$TELESCREEN_URL/api/v1/events"
```

A read-only calendar returns `403`. A `409 conflict` means the event changed at
the provider after the last sync; read it again and retry.

## Music

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/music/connection` | Connected, configured, display name, status |
| POST | `/music/connect/start` | Return the Spotify consent URL (422 when unconfigured) |
| DELETE | `/music/connection` | Forget the stored token (204) |
| GET | `/music/now-playing` | Track, artists, album art, progress, and active device |
| GET | `/music/devices` | Available Spotify Connect devices |
| POST | `/music/play` | Resume playback (204) |
| POST | `/music/pause` | Pause (204) |
| POST | `/music/next` | Next track (204) |
| POST | `/music/previous` | Previous track (204) |
| PUT | `/music/volume` | Body `{ "percent": 0-100 }` (204) |
| PUT | `/music/device` | Body `{ "deviceId": "..." }`; transfers playback (204) |
| GET | `/music/recent` | Recently played albums (max 12) |
| GET | `/music/playlists` | Up to 50 playlists, preceded by Liked Songs |
| POST | `/music/play-context` | Start a `spotify:` URI on the active device (204) |

Playback routes return `422 not_connected` when no Spotify account is
connected, `422 needs_reconnect` when the stored token was rejected,
`422 no_active_device` when Spotify has no active device, and
`403 premium_required` without Premium. `/music/recent` and
`/music/playlists` return `422 missing_scope` until the account is reconnected.
`track` is null when nothing is playing.

## Meals

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/meals/current` | This week, tonight's meal, cache timestamp, stale flag |
| GET | `/meals/plan` | Planned days in a range (`start` and `end`, `YYYY-MM-DD`, end exclusive, max 62 days) |
| GET | `/meals/board` | Like `/meals/plan` plus recipe photo, time, cuisine, and leftover provenance |
| GET | `/meals/kitchen` | Shopping list, pantry gaps, and expiring food |
| GET | `/meals/status` | Configuration only, no network call |
| POST | `/meals/test` | Fetch the current plan once and report the result |

Responses carry `fetchedAt` and `stale`. `stale: true` means PantryPal was
unreachable and the last good response is being served. A disabled module
returns `404`; missing configuration or an unreachable PantryPal with no cache
returns `503`.

## Weather

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/weather` | Current conditions, today, a five-day forecast, and the next 24 hours |

Open-Meteo needs no key. The location and units come from settings, and the
household time zone is used. Cached for 15 minutes, with `stale: true` on
upstream failure. Returns `503` when the module is disabled, no location is set,
or upstream fails with no cache.

## Travel

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/travel` | Driving time from home to every saved destination |
| GET | `/travel/status` | Module and API-key status, no network call |

Requires `GOOGLE_MAPS_API_KEY`, the Travel module, and a home address. Cached
for 10 minutes, with `stale: true` on failure. Returns `503` when unconfigured
or disabled.

## Routes outside the API

Two OAuth redirect targets are mounted at the root, not under `/api/v1`, and are
not part of the OpenAPI document:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/auth/google/callback` | Finish Google OAuth; redirects to `/settings` |
| GET | `/auth/spotify/callback` | Finish Spotify OAuth; redirects to `/settings` |

Browsers arrive there without a token. Each uses the single-use `state` nonce
issued by the matching `start` endpoint as proof, and renders an HTML page on
failure.

## OpenAPI

`GET /openapi.json` returns the full 3.1 document, including schemas, tags, and
the bearer security scheme. It is public, so a client generator can be pointed
at a running instance:

```bash
curl -s "$TELESCREEN_URL/openapi.json" > telescreen-openapi.json
```

The web app's TypeScript types are generated from this document during
development; see [Local setup](../develop/setup).
