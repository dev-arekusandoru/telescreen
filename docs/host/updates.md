# Updates

Telescreen updates by rebuilding the image from the checked-out source. There is
no self-updater and no package registry to trust: you decide when the code moves
forward, and the database migrates itself on the next boot.

## Before you update

1. Read the commit history or release notes for anything that changes
   configuration (`git log --oneline <last>..origin/main`).
2. Back up: stop the container and copy the data directory plus `.env`. See
   [Backups and restore](backups).
3. Note the current commit, so you can go back:

```bash
git rev-parse --short HEAD
```

## Update

```bash
cd /path/to/telescreen
git pull
docker compose up -d --build
```

`--build` is what makes this an update: Compose rebuilds the image from the
current working tree, replaces the container, and keeps the `./data` mount. The
old image stays around as a dangling layer set until pruned.

If you build a tag yourself instead of using `build: .`, pull or build the new
image and run `docker compose up -d`; either way the container is recreated, not
restarted in place.

## What happens on boot

The entrypoint is the same every time:

1. Open `telescreen.db` (creating it if the directory is empty) and enable WAL.
2. Apply pending migrations from the image's `drizzle/` folder, in order.
3. Seed a household only if none exists — an existing household is never
   touched.
4. Start the HTTP server on `8788` and the calendar sync scheduler.

So migrations are automatic and idempotent. There is no maintenance window beyond
the restart, but a migration that rewrites a large table takes as long as it
takes; the container is not healthy until the server answers.

## Check the result

```bash
docker compose ps
curl -s http://127.0.0.1:8788/api/v1/health
docker compose logs --tail=50 telescreen
```

The health response carries the running `version`, which should match the
`package.json` you just built. The log should show the listen line with the
household name and the database path, and no `TELESCREEN_SECRET_KEY` warning.

Then open the app and spot-check one thing per area: an event, a chore,
**Settings > Household > General**, and any module you use.

## Dependency and toolchain changes

The image installs dependencies itself with `pnpm install --frozen-lockfile`, so
a changed `pnpm-lock.yaml` is handled by the build — you do not run `pnpm install`
on the host. Two cases need attention:

- **Node major version bumps.** The Dockerfile pins `node:22-bookworm-slim`. A
  bump arrives with the update; check the release notes for the new minimum.
- **Native modules.** `better-sqlite3` compiles in the build stage, which installs
  `build-essential` and `python3`. A failed build there usually means the base
  image changed, not your host.

Rebuilds are cached, so a source-only change is fast; a lockfile change
reinstalls dependencies and takes longer.

## The PWA on the tablet

The web app is served from the image, and the service worker caches the app shell
plus hashed assets:

- `/assets/*` are content-hashed and cached forever.
- `index.html`, the manifest, and icons are served with `no-cache`.
- Navigations are network-first, so a normal reload after an update fetches the
  new shell.

Usually one reload is enough. If the tablet still shows the old build, close the
PWA from the app switcher and reopen it; as a last resort, remove the home-screen
icon and add it again (that clears the site's caches and storage for the origin,
and does not touch server data).

## Rolling back

```bash
git checkout <previous-commit>
docker compose up -d --build
```

Caveats:

- **Migrations are forward-only.** If the newer version added or rewrote schema,
  the older code may fail to start or misread data. Drizzle has no down
  migrations here.
- **The safe rollback is data too:** restore the pre-update backup of `data/` and
  the `.env` you saved, then run the older commit.
- **Provider cache is disposable**, but restoring an older database resurrects
  old cached events until the next sync, and revives API tokens revoked since the
  backup.
- **Downgrade the browser side too** if the API changed: after rolling back, close
  and reopen the PWA so it does not run a newer shell against an older server.

## Housekeeping

Old images and build cache accumulate with every rebuild:

```bash
docker image prune -f
docker builder prune -f
```

Do not prune volumes — `/data` is a bind mount, but the habit protects you if you
ever switch to a named volume.
