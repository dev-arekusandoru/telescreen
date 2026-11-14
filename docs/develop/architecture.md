# Architecture

Telescreen is a pnpm workspace: a Hono server that owns SQLite, provider sync and credentials, and a React app typed against a generated client. The server serves the built app, so production is one process.

## Workspace

| Path | Package | Role |
|---|---|---|
| `src/`, `test/`, `drizzle/` | `telescreen` | API server, migrations, CLI, server tests. |
| `web/` | `@telescreen/web` | Vite + React app, bundled to `web/dist`. |
| `docs/` | `@telescreen/docs` | VitePress documentation site. |

Design rules: [SPEC.md](https://github.com/dev-arekusandoru/telescreen/blob/main/SPEC.md).

## Server

Boot order in [`src/server.ts`](https://github.com/dev-arekusandoru/telescreen/blob/main/src/server.ts): load `.env`, open SQLite from `TELESCREEN_DATA_DIR` (WAL mode), apply migrations, seed a household with Alex and Vale when the database is empty, build the app, run the chore tick (every 15 minutes), start the sync scheduler, then listen. `SIGTERM` and `SIGINT` stop the scheduler, close the socket and close SQLite.

[`src/app.ts`](https://github.com/dev-arekusandoru/telescreen/blob/main/src/app.ts) builds an OpenAPI-aware Hono app: domain errors map to `{ error: { code, message, details } }`, Zod failures to a 400, anything else to a logged 500. Bearer auth guards `/api/v1/*` except `/api/v1/health`. The OpenAPI 3.1 document is served at `/openapi.json`, the OAuth callbacks are mounted outside `/api/v1`, and static web serving is registered last.

| Path | Role |
|---|---|
| [`src/config.ts`](https://github.com/dev-arekusandoru/telescreen/blob/main/src/config.ts) | Environment readers; `DEFAULT_PORT` is 4000. |
| [`src/db/schema.ts`](https://github.com/dev-arekusandoru/telescreen/blob/main/src/db/schema.ts) | Every table; `db/client.ts` opens and migrates. |
| `src/routes/` | One file per API area, each exporting `register<Area>Routes(app)`. |
| `src/schemas/` | Zod request/response schemas with `.openapi("Name")`. |
| `src/services/` | Business logic over Drizzle, taking `Ctx` or `Db`; throws `AppError`. |
| `src/auth/` | Bearer tokens (`ts_…`, sha256-hashed) and the auth middleware. |
| [`src/lib/crypto.ts`](https://github.com/dev-arekusandoru/telescreen/blob/main/src/lib/crypto.ts) | AES-256-GCM for provider secrets, key from `TELESCREEN_SECRET_KEY`. |
| `src/calendar/`, `src/music/` | Provider clients (see below). |
| [`src/web.ts`](https://github.com/dev-arekusandoru/telescreen/blob/main/src/web.ts) | Static serving of `web/dist` with SPA fallback and cache headers. |

## Add an API area

1. `src/schemas/<area>.ts`: Zod schemas; name components with `.openapi("Name")`.
2. `src/services/<area>.ts`: logic over Drizzle. Never return `secretEncrypted`.
3. `src/routes/<area>.ts`: `createRoute({...})` plus `app.openapi(route, handler)` inside `register<Area>Routes`. Use `c.var.ctx` and `json()` from `src/routes/util.ts`; add a tag in the `doc31` block in `app.ts`.
4. Append the registrar to `routeRegistrars` in [`src/routes/index.ts`](https://github.com/dev-arekusandoru/telescreen/blob/main/src/routes/index.ts). Hono matches in order, so register static paths before `/:id` ones.
5. Run `pnpm openapi` and commit `web/openapi.json` and `web/src/api/schema.d.ts`.
6. Add `test/<area>.test.ts` using `makeTestApp()` from `test/helpers.ts`.

Throw `AppError`; the codes map to fixed statuses: `validation` 400, `unauthorized` 401, `forbidden` 403, `not_found` 404, `conflict` 409, `unprocessable` 422, `provider_error` 502, `unavailable` 503.

## Database

SQLite with Drizzle. All tables are declared in `src/db/schema.ts`: `household`, `member`, `account`, `music_connection`, `calendar`, `event`, `chore`, `chore_occurrence`, `setting` and `api_token`. Edit the schema, run `pnpm db:generate`, and commit the SQL in `drizzle/` with its metadata. Migrations run on every boot and in every test database; there is no down migration, so a reset means deleting the database file.

Instances are single-household: services get `householdId` from their context rather than filtering per request. Settings are key/value rows decoded by `src/schemas/settings.ts`, whose `SETTING_DEFAULTS` is the single source of defaults; add a key there and GET/PUT pick it up.

## Web

| Path | Role |
|---|---|
| `web/src/styles/` | `tokens.css` (light and dark palettes), `base.css`, and the contrast test. |
| `web/src/app/` | Router and shell (`Shell`: 84 px rail at 600 px and wider, bottom tabs below), `WidgetColumn`, `tabs.ts` (module flags hide Meals and Music), theme, wake lock, dates. |
| `web/src/api/` | `openapi-fetch` client, `unwrap()`, generated `schema.d.ts`, error classes, query client. |
| `web/src/features/` | TanStack Query hooks and keys per domain. |
| `web/src/screens/` | One directory per screen: `route.tsx`, screen component, CSS module. |
| `web/src/ui/` | Radix primitives (segmented control, switch, select, slider, toast), `Avatar`, `PageHeader`, `Surface`, `memberColorStyle`. |
| `web/src/seasonal/` | Date-keyed decoration themes rendered by the shell, gated by the `seasonalDecor` setting. |

To add a screen: create `web/src/screens/<name>/route.tsx` as a child of `shellRoute`, list it in `web/src/app/router.tsx`, and add a tab in `web/src/app/tabs.ts` (with a `module` flag if it is optional). Styling is CSS modules and tokens only, with no hard-coded colors.

## Calendar sync

| Piece | Role |
|---|---|
| `src/calendar/ics.ts` | Parses CalDAV resources into events; builds and patches ICS for writes (`RECURRENCE-ID` overrides, `EXDATE` deletes). |
| `src/calendar/recurrence.ts` | Expands `RRULE`/`EXDATE`/`UNTIL` with ical.js and maps UI repeat options to rules. Occurrences iterate as wall-clock time in the event's IANA zone, so DST keeps the wall time. |
| `src/calendar/caldav.ts`, `google.ts` | `Provider` implementations. Writes go to the provider first, then the cache; an etag precondition failure refetches and becomes a 409. |
| `src/calendar/store.ts` | `replaceResource` keeps master row ids stable so instance ids stay valid across syncs. |
| `src/services/sync.ts` | Per-account single-flight sync, calendar discovery, scheduler reading `syncIntervalMinutes`. |
| `src/services/events.ts` | Event expansion, member filter, and writes with `scope` of `this` or `all`. |

Storage is one master row per series or single event plus one override row per modified occurrence (`recurrence_id` is the original start in UTC, or a date for all-day events). A cancelled occurrence is an override with `deleted=1`. Instance ids are `<master id>` or `<master id>~<recurrence key>`.

Google recurring events are stored as masters, with exceptions as overrides. Full syncs cover the last year; incremental syncs use `syncToken`, and a 410 forces a full resync that also prunes stale rows. iCloud change detection compares collection `ctag` first, then per-object `etag`; writes add the `VTIMEZONE` blocks iCloud requires. Calendar `last_error` and account `status` (`ok`, `error`, `needs_auth`) feed the Settings badges and `GET /sync/status`.

## Other modules

| Module | Server | Notes |
|---|---|---|
| Meals | `src/services/meals.ts` | Reads PantryPal over HTTP, normalizes plan days, caches recipes for an hour. |
| Music | `src/music/spotify.ts`, `src/services/music.ts` | PKCE OAuth, encrypted refresh token, retry on 401, typed failure reasons. |
| Weather | `src/services/weather.ts` | Open-Meteo forecast, cached and stale-on-error. |
| Travel | `src/services/travel.ts` | One Routes `computeRouteMatrix` call, cached 10 minutes. |

Optional modules read credentials from the environment; without one the module stays hidden from navigation. Failures surface as `AppError` with `details.reason`.
