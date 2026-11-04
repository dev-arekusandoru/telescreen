# HomeHub

Self-hosted family wall-calendar and chores for two people: a big color-coded calendar (Google and iCloud), recurring and rotating chores, light and dark themes. No cloud, no accounts. See [SPEC.md](SPEC.md); code layout in [ARCHITECTURE.md](ARCHITECTURE.md).

Status: M0 (scaffold). The themed shell, API, database and settings work; calendar and chores screens are placeholders.

## Develop

Requires Node >= 22 and pnpm.

```sh
pnpm install
cp .env.example .env          # optional; export the vars or use `node --env-file`
pnpm dev                      # API on http://localhost:8788 (data in ./data)
pnpm web:dev                  # Vite dev server, proxies /api to :8788
```

Other commands: `pnpm typecheck`, `pnpm test` (server), `pnpm test:web`, `pnpm build`, `pnpm start` (serves API + built web on :8788), `pnpm db:generate` (after schema edits), `pnpm openapi` (regenerate the web API client).

On first boot HomeHub creates the household (time zone from `HOMEHUB_TIMEZONE`, else the system zone) and two members, Alex and Vale; rename and recolor them in Settings.

## Configuration

| Variable | Default | |
|---|---|---|
| `HOMEHUB_DATA_DIR` | `./data` | SQLite file `homehub.db` lives here |
| `HOMEHUB_SECRET_KEY` | | 32 bytes as 64 hex chars; encrypts provider secrets (`openssl rand -hex 32`) |
| `HOMEHUB_TRUST_NETWORK` | off | `1`: `/api/v1` works without a token (private networks only); a sent token is still verified |
| `HOMEHUB_TIMEZONE` | system | IANA zone for the household on first boot |
| `PORT` / `HOST` | `8788` / `0.0.0.0` | |

Without trust mode, create a bearer token: `pnpm cli token create <name>`.

## Deploy (Docker + Tailscale)

```sh
cp .env.example .env          # set HOMEHUB_SECRET_KEY
docker compose up -d --build  # serves on 127.0.0.1:8788, data in ./data
tailscale serve --bg 8788     # HTTPS on your tailnet (needed for the screen wake lock)
```

Then open the `https://<machine>.<tailnet>.ts.net` URL on the iPad and add it to the home screen. Back up by copying `./data`.

## License

MIT
