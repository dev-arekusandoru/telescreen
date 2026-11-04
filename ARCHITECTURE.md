# Architecture (short)

pnpm workspace: root = server (`src/`), `web/` = React app (`@homehub/web`). Design/behavior: `SPEC.md`.

## Server layout (`src/`)
| Path | Role |
|---|---|
| `server.ts` | Boot: open DB in `HOMEHUB_DATA_DIR`, auto-migrate, seed household + Alex/Vale, serve API + built web |
| `app.ts` | `createApp({ db, trustNetwork, webDir })`: error mapping, auth, `/api/v1`, `/openapi.json`, SPA |
| `config.ts` | Env readers (`dataDir`, `dbPath`, `trustNetwork`) |
| `db/schema.ts` | **All tables (SPEC §7)** + `api_token`. `db/client.ts`: `openDb`, `runMigrations` |
| `routes/*.ts` | One file per API area, each exports `register<Area>Routes(app: ApiApp)`; `routes/index.ts` lists them |
| `schemas/*.ts` | zod schemas (request/response, `.openapi("Name")`) |
| `services/*.ts` | Business logic taking `Ctx` (`{ db, householdId, now() }`) or `Db`; throw `AppError` (`lib/errors.ts`) |
| `auth/` | Bearer tokens (`hh_…`, sha256-hashed) and middleware; `HOMEHUB_TRUST_NETWORK=1` allows tokenless requests |
| `lib/crypto.ts` | `encryptSecret` / `decryptSecret` (AES-256-GCM, key `HOMEHUB_SECRET_KEY`) for `account.secret_encrypted` |
| `lib/ids.ts` | `newId("prefix")` text ids |
| `web.ts` | Static serving of `web/dist` with SPA fallback |

## Add an API area (e.g. `accounts`, `calendars`, `events`, `chores`)
1. `src/schemas/<area>.ts`: zod schemas, `.openapi("Name")` for named components.
2. `src/services/<area>.ts`: logic over Drizzle; never return secrets (`secretEncrypted`).
3. `src/routes/<area>.ts`: `createRoute({...})` + `app.openapi(route, handler)` inside `register<Area>Routes`. Use `c.var.ctx`, `json()` from `routes/util.ts`; add the tag to `app.ts` `doc31`.
4. Append the registrar to `routeRegistrars` in `src/routes/index.ts` (static paths before `/:id` ones).
5. `pnpm openapi` regenerates `web/openapi.json` and `web/src/api/schema.d.ts` (commit both).
6. Tests in `test/<area>.test.ts` with `makeTestApp()` from `test/helpers.ts` (in-memory SQLite, migrated, seeded, token attached).

Errors: throw `new AppError("not_found" | "conflict" | "validation" | …, msg)`; body is `{ error: { code, message } }`.

## Database
Edit `src/db/schema.ts`, run `pnpm db:generate` (writes `drizzle/NNNN_*.sql`), commit it. Migrations run on every boot.
Settings are key/value rows (`setting`): add a key in `src/schemas/settings.ts` (schema + `SETTING_DEFAULTS`).

## Web layout (`web/src/`)
| Path | Role |
|---|---|
| `styles/tokens.css` | Design tokens, light + dark (`<html data-theme="system\|light\|dark">`); `base.css` reset + fonts |
| `app/` | `router.tsx` (route tree), `routes.tsx` (root + `shellRoute`), `Shell` (84px rail ≥600px / bottom tabs <600px), `tabs.ts` (nav; `module` flag hides Meals/Music), `theme.ts`, `MemberProgress` (header strip), `dates.ts` (household-timezone formatting) |
| `api/` | `client` (openapi-fetch, `unwrap()`), generated `schema.d.ts`, `errors`, `queryClient` |
| `features/queries.ts` | TanStack Query keys/hooks (household, members, settings); add new feature hooks in new files next to it |
| `screens/<name>/` | `route.tsx` (child of `shellRoute`) + screen component + CSS module |
| `ui/` | Small primitives on Radix (SegmentedControl, Switch) + `Avatar`, `PageHeader`, `Surface`; member colors via `memberColorStyle(token)` → `--c` |

Add a screen: `screens/<name>/route.tsx`, list it in `app/router.tsx`, add a tab in `app/tabs.ts`.
Styling: CSS modules + tokens only; no hard-coded colors. Web tests: Vitest + Testing Library; `src/test/api.tsx` has `stubApi()` / `renderAt(path)`.

`web/src/styles/contrast.test.ts` parses `tokens.css` and enforces WCAG contrast for every text/surface/member pair in light and dark; run it after editing tokens. `e2e/` holds Playwright specs (`playwright.config.ts`).

## Commands
`pnpm dev` (API :8788) + `pnpm web:dev` (Vite, proxies `/api`) · `pnpm typecheck` · `pnpm test` / `pnpm test:web` · `pnpm build` · `pnpm start` · `pnpm cli token create <name>`

## Calendar sync (`src/calendar/`, `services/{accounts,calendars,sync,events}.ts`)
| Piece | Role |
|---|---|
| `calendar/ics.ts` | Parse CalDAV resources into `event` rows; build/patch ICS for writes (new event, edit master, edit one occurrence = override with `RECURRENCE-ID`, delete one = `EXDATE`) |
| `calendar/recurrence.ts` | `expandMaster` (ical.js RRULE iterator, EXDATE, UNTIL), repeat ↔ RRULE mapping. Occurrences are iterated as floating wall-clock time and converted with the event's IANA zone, so DST keeps the wall time |
| `calendar/caldav.ts` / `google.ts` | `Provider` implementations (tsdav + fetch / plain fetch). Writes: provider first, then cache; etag precondition failure refetches and throws `ProviderConflictError` → 409 |
| `calendar/store.ts` | `replaceResource` keeps the master row id stable across syncs (instance ids stay valid) |
| `services/sync.ts` | Per-account single-flight sync, calendar discovery, scheduler (`startSyncScheduler`, reads `syncIntervalMinutes` each cycle) |
| `services/events.ts` | `GET /events` expansion + member filter; create/patch/delete with `scope=this|all` |

- **Storage**: one master row per series/standalone event (`rrule`, plus `raw_ics` for recurring ones) and one override row per modified occurrence (`recurrence_id` = original start as UTC ISO, or `YYYY-MM-DD` for all-day). A cancelled occurrence is an override with `deleted=1`. All-day rows store midnight UTC of the date; the API returns date-only strings.
- **Instance id** = `<master row id>` (single events) or `<master row id>~<recurrence key>` (occurrences).
- **Google** recurring events are stored as masters (`RRULE`/`EXDATE` synthesized into `raw_ics`) with their exceptions as overrides, not `singleEvents=true`, so the cache stays small and unbounded series work; full syncs use `timeMin = now - 1 year`, incremental syncs use `syncToken` (410 → full resync that also removes rows Google no longer reports).
- **iCloud writes** add a `VTIMEZONE` (from `timezones-ical-library`) for every `TZID` used, via `serializeWithTimezones` in `calendar/ics.ts`.
- **iCloud** change detection: collection `ctag` (skip when unchanged), then per-object `etag` diff; there is no `sync-collection` use.
- Calendar `last_error` and account `status` (`ok | error | needs_auth`) feed the Settings badges and `GET /sync/status`.
- `/auth/google/callback` is mounted in `app.ts` outside `/api/v1`; the single-use `state` nonce from `POST /accounts/google/start` is its authentication.
- Tests stub `globalThis.fetch` (`test/fake-caldav.ts` is an in-process CalDAV server; Google fixtures live in `test/fixtures/google/`). `e2e/fake-caldav-server.ts` serves the same fake CalDAV over HTTP (`ICLOUD_CALDAV_URL`) so Playwright can create events end to end.
