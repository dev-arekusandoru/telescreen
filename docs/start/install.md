# Install

Telescreen ships as a single container built from this repository. You need
Docker, a writable data directory, and a way to reach it over HTTPS — Tailscale
is the documented path.

## Prerequisites

- Docker with the Compose plugin (`docker compose version`).
- Node 22 and pnpm only if you develop or build outside Docker; the image builds
  itself.
- A private network. Tailscale is recommended: `tailscale serve` gives you a
  valid HTTPS certificate for your tailnet, which the PWA and the screen wake
  lock require.
- Optionally, a [PantryPal](https://github.com/dev-arekusandoru/pantry-pal)
  server on the same host if you want the Meals module.

## Clone and configure

```bash
git clone https://github.com/dev-arekusandoru/telescreen.git
cd telescreen
cp .env.example .env
```

`.env` is read by Docker Compose (`env_file:`) and, in development, by the server
itself. Environment variables already set in the shell win over the file.

Three values matter for the first boot:

| Variable | What to put there |
| --- | --- |
| `TELESCREEN_SECRET_KEY` | 64 hex characters from `openssl rand -hex 32`. Encrypts provider secrets. |
| `TELESCREEN_TRUST_NETWORK` | `1` to let requests from your private network act as the household without a token. |
| `TELESCREEN_TIMEZONE` | Optional IANA zone, e.g. `Europe/Berlin`. Defaults to the server's system zone. |

```bash
openssl rand -hex 32
```

Paste the result into `TELESCREEN_SECRET_KEY`. Keep a copy: without it, connected
calendar and Spotify accounts must be reconnected.

`TELESCREEN_TRUST_NETWORK=1` is what makes the tablet work without a login. Only
use it when the app is reachable exclusively from a private network. See
[Access and security](../host/security) for tokens if you need them.

## Prepare the data directory

The container runs as the unprivileged `node` user, uid 1000. The bind mount must
be writable by that uid or the database cannot be created:

```bash
mkdir -p data
sudo chown -R 1000:1000 data   # only if the directory is owned by another user
```

If you skip this and later see `SQLITE_CANTOPEN` in the logs, run the `chown`
above and restart.

## Start it

```bash
docker compose up -d --build
```

The service builds the image (`telescreen:latest`), publishes port 8788 on
`127.0.0.1` only, and mounts `./data` at `/data`. Database migrations run on
every boot, and the household is seeded if the database is empty.

## Check it is running

```bash
curl -s http://127.0.0.1:8788/api/v1/health
```

A healthy instance answers `{"ok":true,"version":"..."}`. The container also has
a built-in health check that polls the same endpoint every 30 seconds:

```bash
docker compose ps
docker compose logs -f telescreen
```

The log line `Telescreen listening on http://0.0.0.0:8788 (Our Home, Europe/Berlin)`
confirms the database path and the seeded household.

## Give the tablet an HTTPS address

```bash
tailscale serve --bg 8788
```

This proxies `https://<machine>.<tailnet>.ts.net` to `http://127.0.0.1:8788` and
keeps running in the background. Open the tailnet URL on the tablet.

To use a port other than 443:

```bash
tailscale serve --bg --https=8444 http://127.0.0.1:8788
```

Then set the public URL so OAuth redirects point at the right place:

```bash
# .env
TELESCREEN_PUBLIC_URL=https://machine.your-tailnet.ts.net:8444
```

Provider redirect URIs are built as
`${TELESCREEN_PUBLIC_URL}/auth/google/callback` and
`${TELESCREEN_PUBLIC_URL}/auth/spotify/callback`. If you register a different URI
with the provider, override it with `GOOGLE_REDIRECT_URI` or
`SPOTIFY_REDIRECT_URI`.

## First boot

Open the tailnet URL. You should see the calendar for the seeded household with
the tab bar or left rail, and Mara and Theo in the member chips. Continue with
[First run](first-run).

## Portainer and other stacks

If you run Portainer, create a stack from the repository's
`docker-compose.yml` and supply the same `.env` values in the stack's environment
section. Compose requires a file named `.env` in the project directory for
`env_file:`; on Portainer, paste the variables into the stack environment
instead and drop the `env_file:` entry.

The compose file uses only its own default network, so it starts on a fresh
host. To reach a PantryPal container by service name, join its Docker network
with an override file; see [Deployment](../host/deployment). Setting
`PANTRYPAL_URL` to PantryPal's tailnet or LAN address needs no shared network.
