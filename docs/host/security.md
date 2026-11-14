# Access and security

Telescreen has no login screen and no user accounts. Its security model is the
network: whatever can reach the container is treated as the household. That is a
deliberate choice for a wall display, and it makes two things load-bearing — who
can reach the port, and what you do with the secret key.

## The access model

| Layer | What it does |
| --- | --- |
| Network (tailnet, VPN, firewall) | The real boundary. A device that can open the URL is in. |
| `TELESCREEN_TRUST_NETWORK` | Decides whether an unauthenticated request is accepted as the household |
| Bearer tokens | Optional per-client credentials for scripts and integrations |

The app listens on `8788` and the Compose file publishes it on `127.0.0.1`
only. `tailscale serve` then exposes it to your tailnet — and to nothing else.
Anything that widens that reach (binding to `0.0.0.0`, port-forwarding the
router, a public reverse proxy) widens the access model too.

## Trust mode

`TELESCREEN_TRUST_NETWORK` is off unless set to `1` or `true`.

- **On (`1`)** — a request to `/api/v1` with no `Authorization` header acts as the
  single household. Requests that *do* send a header are still verified: a bogus
  or revoked token gets `401`, it does not fall back to the household. If no
  household exists yet, the request gets `503`.
- **Off** — every `/api/v1` request needs a valid bearer token. Calendars load in
  the UI only if the browser can send one, which it does not do by default; this
  mode is for API clients, not for the tablet.

`TELESCREEN_TRUST_NETWORK=1` is therefore what makes the tablet work without a
login, and it is only appropriate when the instance is reachable solely from a
private network. The startup log states the mode explicitly.

`GET /api/v1/health` is always public (that is what the container health check
uses), and `/openapi.json` describes the API without exposing data.

## Bearer tokens

For scripts, home automation, or anything that is not the wall display. Create a
token on the host:

```bash
pnpm cli token create "home assistant"
```

or, in the container:

```bash
docker compose exec telescreen node dist/cli.js token create "home assistant"
```

The output looks like:

```
Token tok_… (home assistant). Shown once:
ts_1f0c…
```

- Format: `ts_` plus 32 hex characters.
- The database stores only a SHA-256 hash and the first 8 characters as a display
  prefix. The plaintext is printed once, at creation, and cannot be recovered.
- Send it as `Authorization: Bearer ts_…`.
- List tokens (including revoked ones) with `pnpm cli token list`; revoke with
  `pnpm cli token revoke <id>`. Revocation is immediate.
- `lastUsedAt` is updated on each successful call.

Tokens are scoped to the single household. There are no per-token permissions,
so treat a token as full access to the API.

```bash
curl -s -H "Authorization: Bearer $TELESCREEN_TOKEN" \
  https://telescreen.your-tailnet.ts.net/api/v1/household
```

## Secrets at rest

Provider credentials — Google refresh tokens, the iCloud Apple ID and
app-specific password, the Spotify refresh token — are stored in the database
encrypted with AES-256-GCM.

| Property | Value |
| --- | --- |
| Algorithm | AES-256-GCM (authenticated) |
| Key | `TELESCREEN_SECRET_KEY`, 32 bytes as 64 hex characters or base64 |
| Blob format | `v1.<iv>.<tag>.<ciphertext>`, base64url parts, 12-byte random IV per record |
| Failure mode | Wrong key or altered blob fails authentication and cannot be decrypted |

Generate the key with `openssl rand -hex 32`. Requirements:

- It must decode to exactly 32 bytes. A short or malformed value makes account
  connection fail with a readable error, and the server logs a warning at boot.
- It is never written to the database, only read from the environment.
- Losing it means every stored provider secret is unrecoverable: accounts show
  "Reconnect needed" and have to be reconnected. There is no recovery key.

The rest of the database is **not** encrypted: event titles, chores, member names,
and settings are plain text in `telescreen.db`. Encryption protects provider
credentials, not the household's calendar.

## What the API never returns

- Account secrets: the account view carries id, provider, label, status and
  `lastError` only. There is no endpoint that returns `secretEncrypted`.
- Token hashes and plaintexts: token listings expose id, name, prefix,
  timestamps, and a revoked flag.
- Spotify tokens: refreshed access tokens stay on the server; the browser talks
  to `/api/v1/music/*` only.

Provider API keys (`GOOGLE_MAPS_API_KEY`, `PANTRYPAL_TOKEN`,
`SPOTIFY_CLIENT_SECRET`) live in the environment and are only reported as
booleans in status endpoints ("configured: true/false").

## HTTPS and the browser

- The screen wake lock needs a secure context. Over plain `http://` the browser
  refuses it and the display falls asleep. `tailscale serve` provides HTTPS with
  a trusted certificate; that is the documented setup.
- The PWA and its service worker are also restricted to secure contexts, so
  installing to the home screen requires HTTPS.
- Anyone with the URL on the network can read the household's calendar. There is
  no per-device session to revoke; removing a device from the tailnet is the
  revocation mechanism.

## Do not expose it publicly

Telescreen has no login, no rate limiting, no CSRF tokens, and no TLS of its own.
Putting it on the public internet would publish your calendar and let strangers
create or delete events. If you need access from outside your home network, add
the device to the tailnet (or another VPN) rather than opening a port.

## Backups contain secrets

A database backup is enough to impersonate the household's provider connections
if it is copied together with `TELESCREEN_SECRET_KEY`. Store them separately, and
prefer an encrypted destination. Details: [Backups and restore](backups).
