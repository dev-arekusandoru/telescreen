# Deployment

Telescreen is one container with one volume. Nothing else is required: no
database server, no queue, no sidecar. This page describes what the shipped
Compose file does and how to put HTTPS in front of it.

## The Compose service

```yaml
services:
  telescreen:
    build: .
    image: telescreen:latest
    container_name: telescreen
    restart: unless-stopped
    ports:
      - "127.0.0.1:8788:8788"
    env_file:
      - path: .env
        required: false
    volumes:
      - ./data:/data
```

| Piece | Effect |
| --- | --- |
| `build: .` + `image:` | Builds the local Dockerfile and tags the result `telescreen:latest` |
| `container_name` | Fixed name, so `docker compose logs telescreen` and `docker exec` are predictable |
| `restart: unless-stopped` | Comes back after a reboot or crash, stays down when you stop it deliberately |
| `ports: 127.0.0.1:8788:8788` | Published on loopback only — not reachable from other machines until a proxy exposes it |
| `env_file` (optional) | Extra variables from `.env`; a missing file is not an error |
| `volumes: ./data:/data` | The only persistent state, owned by uid 1000 inside the container |

The image is a two-stage build on `node:22-bookworm-slim`. The build stage
compiles the server with `tsc` and the web app with Vite, then prunes dev
dependencies; the runtime stage carries only `dist/`, `web/dist/`, `drizzle/`,
and production `node_modules`, and runs as the unprivileged `node` user. It
declares `VOLUME /data` and `EXPOSE 8788`.

## Reaching PantryPal

The compose file uses only its own default network, so a fresh clone starts
without any network that must already exist. Meals still need a route from the
container to PantryPal. The simplest option is PantryPal's tailnet or LAN URL:

```bash
PANTRYPAL_URL=https://pantrypal.your-tailnet.ts.net
```

If both stacks run on the same host and you prefer Docker's internal DNS, join
PantryPal's network with a `docker-compose.override.yml` next to the compose
file. Compose merges it automatically:

```yaml
services:
  telescreen:
    networks: [default, shared]

networks:
  shared:
    name: pantrypal_default   # check with: docker network ls
    external: true
```

Then set `PANTRYPAL_URL=http://pantrypal:8787` (use the container name and the
port PantryPal listens on). PantryPal must publish no port for this to work, but
the network and container must already exist when Telescreen starts.

## HTTPS

The container speaks plain HTTP. Terminate TLS in front of it.

### Tailscale (documented path)

```bash
tailscale serve --bg 8788
```

`tailscale serve` binds to the tailnet interface, obtains a certificate for
`https://<machine>.<tailnet>.ts.net`, and proxies to `http://127.0.0.1:8788`.
Because it is bound to the tailnet, the app is reachable only by devices in your
tailnet.

On a port other than 443:

```bash
tailscale serve --bg --https=8444 http://127.0.0.1:8788
# then in .env:
TELESCREEN_PUBLIC_URL=https://machine.your-tailnet.ts.net:8444
```

Include the port in `TELESCREEN_PUBLIC_URL`, otherwise provider redirect URIs are
built for 443 and OAuth fails with a redirect mismatch.

### Your own reverse proxy

Any proxy that can reach `127.0.0.1:8788` works — Caddy, nginx, Traefik. Keep the
instance on a private network anyway: Telescreen assumes the network is the
access boundary, and has no login screen. Set `TELESCREEN_PUBLIC_URL` to the
external HTTPS URL so OAuth callbacks land on the right host, and forward `Host`
and `X-Forwarded-*` unchanged.

If the proxy is not on the tailnet, use every other control you have (VPN, firewall
rules, tokens with `TELESCREEN_TRUST_NETWORK` off). See
[Access and security](security).

## Checking a deployment

```bash
curl -s http://127.0.0.1:8788/api/v1/health
# {"ok":true,"version":"0.1.0"}

docker compose ps          # STATUS should report (healthy)
docker inspect --format '{{json .State.Health}}' telescreen | jq
```

`/api/v1/health` is public and answers with `{ ok, version }`. The image's
`HEALTHCHECK` polls it every 30 seconds with a 5-second timeout, a 10-second
start period, and 3 retries, so a fresh container reports `starting` briefly
before turning `healthy`.

`docker compose ps` showing `Up (healthy)` together with an unreachable page
almost always means the proxy, not the app — see
[Troubleshooting](troubleshooting).

## Changing ports

Two ports matter and they are independent:

- **Inside the container** `PORT=8788` is set by the Compose `environment` block
  and by the image. Change it only if you also change the mapping.
- **On the host** the mapping `127.0.0.1:8788:8788` decides the local port. To
  publish `9000` instead, write `127.0.0.1:9000:8788` and point
  `tailscale serve` at 9000.

Binding to `0.0.0.0` on the host (`"8788:8788"`) removes the loopback protection.
Do that only when a firewall restricts who can reach the port.

## Moving to another machine

1. Stop the container.
2. Copy the whole data directory, including `telescreen.db-wal` and
   `telescreen.db-shm`.
3. Move `TELESCREEN_SECRET_KEY` with it.
4. Start the same image on the new host, with the same `TELESCREEN_PUBLIC_URL` or
   a new one whose OAuth redirect URIs you have updated.

Procedure and caveats: [Backups and restore](backups). Updating an existing
deployment: [Updates](updates).
