# Backups and restore

Everything Telescreen knows is in one directory: the household, members, cached
events, chores, settings, API tokens, and the encrypted provider secrets. Backing
up means copying that directory — and then keeping the secret key safe somewhere
else.

## What to copy

| Item | Where | Why |
| --- | --- | --- |
| `telescreen.db` | data directory | All application data |
| `telescreen.db-wal` | data directory | Recent commits not yet checkpointed |
| `telescreen.db-shm` | data directory | WAL index; rebuilt on open, harmless to copy |
| `TELESCREEN_SECRET_KEY` | environment / `.env` | Without it, stored provider secrets are unreadable |
| `.env` (optional) | project root | Same key plus provider settings — handle as a secret |

Copy the whole directory rather than the `.db` file alone: with the WAL enabled, a
bare `telescreen.db` can be missing the last transactions.

## Stop, copy, start

The simplest safe backup works on a stopped container:

```bash
cd /path/to/telescreen
docker compose stop telescreen

tar czf telescreen-$(date +%F).tar.gz data/ .env

docker compose start telescreen
```

With the container stopped, the WAL is checkpointed on close, so the copied
database is complete and consistent. Store the archive on a machine that is not
this one.

## Online backup

If stopping is not acceptable, use SQLite's backup API, which reads a consistent
snapshot while the app keeps running:

```bash
sqlite3 data/telescreen.db ".backup 'telescreen-backup.db'"
```

This needs the `sqlite3` client on the host. Do not copy the files with `cp` or
`rsync` while the container runs — you can capture a half-written WAL.

A nightly cron job with the stop/copy/start form is fine for a household: the app
is unavailable for a second or two, and the tablet retries on its own.

## Restore

```bash
cd /path/to/telescreen
docker compose stop telescreen

mv data data.old
tar xzf telescreen-2026-11-14.tar.gz      # restores data/ and .env
sudo chown -R 1000:1000 data              # container runs as uid 1000

docker compose up -d
curl -s http://127.0.0.1:8788/api/v1/health
```

The container applies any pending migrations on boot, so a backup made by an
older version is upgraded automatically. Once the page loads, check
**Settings > Calendar > Accounts**: accounts should show "Connected" and a sync
should start on its own. If they show "Reconnect needed", the restored database
was encrypted with a different `TELESCREEN_SECRET_KEY`.

Delete `data.old` once you are satisfied.

## The key

`TELESCREEN_SECRET_KEY` is not in the database, so it is not in a data-directory
archive unless you archived `.env` with it. Two rules:

1. Keep a copy somewhere durable and separate — a password manager entry is
   enough.
2. Do not store it next to the database backup. The pair is what lets someone
   decrypt the household's Google, iCloud, and Spotify credentials.

If the key is lost, the app still runs and the calendar cache still displays, but
stored connections cannot be decrypted. Reconnect each account under
**Settings > Calendar > Accounts** and **Settings > Modules > Music** with the new
key.

## What a restore does not bring back

- **Provider data lives at the provider.** Calendar events, reminders, and
  Spotify state are owned by Google, Apple, and Spotify. Restoring an old database
  restores the old *cache*; the next sync replaces it with the provider's current
  state.
- **Deleted events stay deleted.** If you restore a backup from before a deletion,
  the event may reappear in the cache briefly, but a sync removes it again.
- **Revoked tokens come back.** API tokens live in the database, so restoring an
  older backup makes previously revoked tokens valid again. Re-revoke anything
  you killed in the meantime.
- **Settings stored in the database do come back**, including household name,
  time zone, module flags, and the default write calendar.

## Test a restore

Do this once, before you need it:

```bash
mkdir -p /tmp/ts-restore && tar xzf telescreen-2026-11-14.tar.gz -C /tmp/ts-restore
docker run --rm -d --name telescreen-restore \
  -p 127.0.0.1:9788:8788 \
  --env-file /tmp/ts-restore/.env \
  -e TELESCREEN_DATA_DIR=/data \
  -v /tmp/ts-restore/data:/data \
  telescreen:latest
```

Open `http://127.0.0.1:9788` (or serve it on a spare tailnet port), confirm the
calendar and settings are there, then `docker rm -f telescreen-restore`. The
restored copy shares the household's provider connections, so do not leave both
instances syncing for long — provider rate limits and duplicate writes are the
risk, not data loss.

Next: [Updates](updates) explains the backup step before an upgrade.
