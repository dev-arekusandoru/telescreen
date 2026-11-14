# Tests and checks

Telescreen has four layers of checks: TypeScript, server unit tests, web component tests, and Playwright end-to-end flows. Run the cheap ones constantly and the expensive ones before a pull request.

| Command | What it runs |
|---|---|
| `pnpm typecheck` | `tsc --noEmit` for the server, then `tsc --noEmit` in `web`. |
| `pnpm test` | Server tests with Vitest (`node` environment, `test/**/*.test.ts`). |
| `pnpm test:web` | Web tests with Vitest (`jsdom`, `web/src/**/*.test.{ts,tsx}`). |
| `pnpm test:all` | `test` then `test:web`. |
| `pnpm build` | Server compile to `dist/` and the Vite production build to `web/dist/`. |
| `pnpm e2e` | Builds the web app, then runs Playwright against a throwaway server. |
| `pnpm e2e:install` | Installs Playwright's Chromium (once per machine or upgrade). |

## Typecheck

`pnpm typecheck` typechecks both packages against their own tsconfigs, including the web tests. The Vite build also runs `tsc --noEmit` first, so a broken type fails `pnpm build` too.

## Server unit tests

```bash
pnpm test
```

Vitest runs from the repository root in the Node environment, covering `test/*.test.ts`. Most tests build the real Hono app with `makeTestApp()` from `test/helpers.ts`: an in-memory SQLite database with migrations applied, the seeded household, a fixed clock (`FIXED_NOW`) and a bearer token. That means requests go through routing, validation, auth and error mapping exactly as in production, without a port or a file.

| Helper or fixture | Use |
|---|---|
| `test/helpers.ts` | `makeTestApp()`, `makeTestCtx()`, authenticated `request()`. |
| `test/fake-caldav.ts` | In-process CalDAV server; tests stub `globalThis.fetch`. |
| `test/fixtures/google/` | Recorded Google Calendar API responses for sync tests. |
| `test/calendar-helpers.ts` | Shared event and calendar fixtures. |

Coverage includes auth, crypto, chores and recurrence, iCloud and Google sync, ICS time zones, meals, music/Spotify, settings, travel and weather.

## Web tests

```bash
pnpm test:web
```

Vitest with `jsdom`, globals enabled and `web/src/test/setup.ts` for Testing Library matchers. CSS modules are compiled non-scoped, so assertions can use class names and contrast/style rules stay testable. `stubApi()` and `renderAt(path)` in `web/src/test/api.tsx` stub `fetch` with an in-memory household, members and settings and render the real router at a URL. Tests live next to their feature (`web/src/screens/.../*.test.tsx`).

## Contrast test

`web/src/styles/contrast.test.ts` runs as part of `pnpm test:web`. It parses `web/src/styles/tokens.css`, resolves the light, dark and system-dark palettes, mixes tokens the way CSS `color-mix` does, and asserts WCAG contrast for every text-on-surface and member-color pairing. Edit tokens and run `pnpm test:web` before anything else; a failure names the token pair.

## End-to-end tests

```bash
pnpm e2e:install   # once
pnpm e2e
```

`pnpm e2e` runs `pnpm web:build` first, then Playwright. The config starts two servers:

| Server | Port | Notes |
|---|---|---|
| Telescreen | 4010 (`E2E_PORT`) | `TELESCREEN_TRUST_NETWORK=1`, `.e2e-data` database deleted and reseeded every run. |
| Fake CalDAV | 4009 (`E2E_PORT - 1`) | `e2e/fake-caldav-server.ts`, wired in as `ICLOUD_CALDAV_URL`. |

The run is deterministic: single worker, blocked service workers, `Europe/Berlin` time zone, `en-US` locale, traces retained on failure only, and one retry when `CI` is set.

Three projects cover the real layouts:

| Project | Viewport | Specs |
|---|---|---|
| `ipad-1180x820` | 1180×820, touch | `smoke.spec.ts`, `flows.spec.ts` |
| `phone-390x844` | 390×844, touch, mobile | `smoke.spec.ts`, `flows.spec.ts` |
| `wall-1440x900` | 1440×900, touch | `right-column.spec.ts` |

`smoke.spec.ts` covers redirects, tab navigation, theme persistence, calendar view persistence, Settings edits, the manifest and icons, and horizontal overflow. `flows.spec.ts` completes a chore and creates a calendar event against the fake CalDAV server. `right-column.spec.ts` checks widget ordering and hiding.

Because the database is thrown away, do not point `pnpm e2e` at an existing `data/` directory; the config sets `TELESCREEN_DATA_DIR` itself.

## Continuous integration

The only workflow in `.github/workflows` is `docs.yml`, which builds and deploys the documentation site. There is no CI job that runs TypeScript, unit tests or Playwright, so those are local responsibilities. Before opening a pull request, run:

```bash
pnpm typecheck && pnpm test:all && pnpm build
```

Add `pnpm e2e` when you touch navigation, the shell, Settings, the event sheet or any screen layout. The docs workflow does fail a pull request that breaks a documentation link or image, because VitePress checks both at build time.
