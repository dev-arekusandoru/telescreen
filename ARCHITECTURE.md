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

## Commands
`pnpm dev` (API :8788) + `pnpm web:dev` (Vite, proxies `/api`) · `pnpm typecheck` · `pnpm test` / `pnpm test:web` · `pnpm build` · `pnpm start` · `pnpm cli token create <name>`
