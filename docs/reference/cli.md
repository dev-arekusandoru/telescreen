# CLI commands

Telescreen has one small admin CLI, and it only manages API tokens. Everything
else — calendars, chores, settings, modules — is done from the web app or the
[REST API](rest-api).

The CLI runs against the SQLite database directly, so it must see the same data
directory as the server. It works while the server is running; the database uses
WAL mode and a busy timeout.

## Commands

| Command | What it does |
| --- | --- |
| `pnpm cli token create <name>` | Create a token and print it once |
| `pnpm cli token list` | List tokens with id, prefix, name, and revocation state |
| `pnpm cli token revoke <id>` | Revoke a token by id |

Run them from the repository root:

```bash
pnpm cli token create iPad
# Token tok_8f3k2m9p0q1r2s3t (iPad). Shown once:
# ts_9f2c...

pnpm cli token list
# tok_8f3k2m9p0q1r2s3t  ts_9f2c1…  iPad

pnpm cli token revoke tok_8f3k2m9p0q1r2s3t
# Revoked.
```

## Where it reads and writes

The command opens `telescreen.db` inside `TELESCREEN_DATA_DIR`, defaulting to
`./data` relative to the current directory.

The CLI does **not** read `.env`; it only uses variables already exported in the
shell. If your server uses the default `./data` (as `docker-compose.yml` does
with its `./data:/data` mount), running `pnpm cli` from the repository root is
enough. Otherwise set the directory explicitly:

```bash
TELESCREEN_DATA_DIR=/srv/telescreen/data pnpm cli token create iPad
```

`pnpm cli` runs `tsx src/cli.ts` and therefore needs the development
dependencies. On the host that means `pnpm install` once.

## Run it inside the container

The runtime image contains the compiled CLI at `dist/cli.js` and no `pnpm`, so
call Node directly:

```bash
docker compose exec telescreen node dist/cli.js token create iPad
docker compose exec telescreen node dist/cli.js token list
docker compose exec telescreen node dist/cli.js token revoke tok_8f3k2m9p0q1r2s3t
```

Compose already sets `TELESCREEN_DATA_DIR=/data` and mounts `./data` there, so
tokens created in the container are the same ones the server checks. `dist/`
is produced by `pnpm build` (and by the image build), not by `pnpm dev`.

## Token behaviour

- A token is `ts_` followed by 32 hexadecimal characters.
- The plain value is printed once, at creation. Copy it then; it cannot be
  retrieved later.
- The database stores only a SHA-256 hash, plus a short prefix for
  identification and the last-used timestamp.
- Revoking marks the row revoked. Requests with that token immediately return
  `401`; the row stays in `token list` flagged `(revoked)`.
- Tokens do not expire. Create one per client (tablet, script, integration) so
  each can be revoked on its own.
- A token created on an empty database also seeds the household, exactly as the
  server does on first boot.

Use a token as `Authorization: Bearer ts_...`. See
[Access and security](../host/security) for the trust-mode alternative and
[REST API](rest-api) for endpoints.

There is no other CLI surface: no commands for members, chores, accounts, or
backups. Backups are a file copy; see [Backups and restore](../host/backups).
