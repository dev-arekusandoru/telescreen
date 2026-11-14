# Local setup

Telescreen is a pnpm workspace with a Node API server and a React single-page app. You run the two together in development; the API is also the only process in production, because it serves the built web app.

## Requirements

| Requirement | Detail |
|---|---|
| Node.js | 22 or newer (`engines` in `package.json`). |
| pnpm | 12 (`packageManager` pins `pnpm@12.18.0`). Run `corepack enable` once, or install pnpm globally with `npm install -g pnpm@12`. |
| Build toolchain | `better-sqlite3` is a native module. macOS needs Xcode Command Line Tools; Debian/Ubuntu need `build-essential` and `python3`, which is what the [Dockerfile](https://github.com/dev-arekusandoru/telescreen/blob/main/Dockerfile) installs. |

Check the versions with `node --version` and `pnpm --version`.

## Install

```bash
git clone https://github.com/dev-arekusandoru/telescreen.git
cd telescreen
pnpm install
```

`pnpm install` resolves the whole workspace: the root server package, `web` (`@telescreen/web`) and `site` (`@telescreen/docs`). Native builds are allow-listed in `pnpm-workspace.yaml` (`allowBuilds`).

## Environment

A `.env` file is optional. `src/config.ts` loads `./.env` at startup if it exists, and variables already set in the shell win.

```bash
cp .env.example .env
```

The defaults are enough to boot:

| Variable | Dev default | Notes |
|---|---|---|
| `TELESCREEN_DATA_DIR` | `./data` | Holds `telescreen.db`. Created on boot if missing. |
| `PORT` | `4000` | API port. |
| `HOST` | `0.0.0.0` | |
| `TELESCREEN_TRUST_NETWORK` | unset | Set to `1` to browse the UI without a bearer token. Otherwise create one with `pnpm cli token create <name>`. |
| `TELESCREEN_SECRET_KEY` | unset | 64 hex characters. Required before you connect Google, iCloud or Spotify accounts locally. |

Without trust mode or a token, every `/api/v1` request except `/api/v1/health` returns 401.

## Run the app

Use two terminals:

```bash
pnpm dev       # API on http://127.0.0.1:4000
pnpm web:dev   # Vite on http://127.0.0.1:4001, proxies /api
```

`pnpm dev` runs `tsx watch src/server.ts`. On boot the server opens the SQLite file, applies pending migrations, seeds a household with Alex and Vale when the database is empty, starts the calendar sync scheduler and the 15-minute chore tick, then listens.

`pnpm web:dev` serves the SPA with hot reload. Vite proxies `/api` to `http://127.0.0.1:4000`; set `TELESCREEN_API_URL` to point the proxy at another instance.

The dev ports sit in the 4000 range on purpose: the deployed container pins `PORT=8788` and Docker Compose publishes it on `127.0.0.1:8788`, so development never collides with a running instance or with `tailscale serve`.

## Build and run the built app

```bash
pnpm build   # tsc -> dist/ and Vite -> web/dist/
pnpm start   # node dist/server.js
```

The built server serves `web/dist` at `/` with an SPA fallback and keeps `/api`, `/health` and `/openapi.json` for itself. If `web/dist/index.html` is missing it logs that it is serving the API only. `TELESCREEN_WEB_DIR` overrides the directory.

Use this build to reproduce anything that only happens in production, including asset caching.

## Database migrations

The schema lives in `src/db/schema.ts`. After editing it:

```bash
pnpm db:generate   # writes drizzle/NNNN_*.sql and updates drizzle/meta
```

Commit the generated SQL and metadata. Migrations run on every boot (`runMigrations`), and in tests against in-memory databases, so a checked-out branch always matches its code. To start from scratch, delete `data/telescreen.db`; there is no down migration.

## Regenerate the OpenAPI types

```bash
pnpm openapi
```

This dumps the OpenAPI document to `web/openapi.json` and regenerates `web/src/api/schema.d.ts` with `openapi-typescript`. Commit both files: the web client is typed against them, and a stale document makes the client wrong rather than merely outdated.

## PWA icons and manifest

```bash
pnpm e2e:install                     # Chromium for Playwright, once
node scripts/generate-icons.mjs
```

The script renders `web/public/icons/*.png` and `web/public/favicon.svg` with Playwright, using the Fraunces font from `node_modules`. Re-run it only when the icon design changes; the PNGs are committed. `web/public/manifest.webmanifest` and `web/public/sw.js` are hand-written.

## Workspace layout

| Path | Package | What it is |
|---|---|---|
| `package.json` | `telescreen` | The server: `src/`, `test/`, `e2e/`, `drizzle/`, `scripts/`. |
| `web/` | `@telescreen/web` | Vite + React app. All packages are dev dependencies because Vite bundles everything. |
| `docs/` | `@telescreen/docs` | Documentation pages plus the VitePress config. |

Next: [tests and checks](checks) after your first successful build.
