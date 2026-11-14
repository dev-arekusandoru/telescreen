# Overview

Telescreen is a self-hosted wall display for a household: a large calendar that
merges Google and iCloud calendars, chores with rotation, and optional widgets
for weather, driving times, meals, and Spotify. It runs as one Docker container
on a private network, and installs to an iPad or tablet as a PWA.

## What it does

- **Calendar.** Google and iCloud calendars side by side, colored per person,
  with Family events in a neutral style. Create, edit, and delete events —
  including simple recurring events — from the event sheet.
- **Chores.** One-off, daily, weekday, weekly, every-N-weeks, and monthly
  chores; fixed, rotating, or "either of us" assignment; tap to complete.
- **Optional modules.** Weather from Open-Meteo, driving times from the Google
  Routes API, meals and the shopping list from PantryPal, and Spotify
  now-playing with playback controls. Each is off until you turn it on in
  Settings and supply any credentials it needs.

## Who it is for

A household of two adults (the seeded members are Mara and Theo) that wants a
shared day view without a subscription, a cloud account, or telemetry. A tablet
in landscape is the primary device; phones get a narrower layout with bottom
tabs. The data model allows more members, and the UI is tuned for two to four.

## Devices and browsers

| Device | Notes |
| --- | --- |
| iPad or larger tablet, landscape | Safari, installed as a PWA, left on |
| Phone, portrait | Bottom tabs; Meals and Music tabs appear only when enabled |
| Desktop browser | Wide layout with the left rail; useful for setup |

The screen wake lock (keep the display awake) needs a secure context, which
means HTTPS. A plain `http://` address will not hold the screen awake.

## Why self-host it

Everything lives on your own machine: one SQLite file, no outbound account, no
analytics. Your calendars stay with Google and Apple — Telescreen keeps a cache
so the wall keeps working when a provider is slow — and you decide who can
reach the instance. The trade-off is that you own the install, the HTTPS
certificate or tailnet, and the backups.

## Where to go next

| Task | Guide |
| --- | --- |
| Put it on a server and open it | [Install](install) |
| Name the household and connect a calendar | [First run](first-run) |
| Learn the calendar views | [Calendar](../use/calendar) |
| Create and edit events | [Events](../use/events) |
| Set up chores | [Chores](../use/chores) |
| Add people or colors | [Settings](../use/settings) |
| Connect Google, iCloud, Spotify, PantryPal | [Google](../connect/google), [iCloud](../connect/icloud), [Spotify](../connect/spotify), [PantryPal](../connect/pantrypal) |
| Read every environment variable | [Configuration](../host/configuration) |
| Understand the access model | [Access and security](../host/security) |
| Move or rebuild the container | [Deployment](../host/deployment) |
| Back up and restore | [Backups and restore](../host/backups) |
| Fix a problem | [Troubleshooting](../host/troubleshooting) |

## Limits

- **One household.** There is no multi-household support and no way to run two
  separate families from one instance.
- **No user accounts.** There are no passwords or sessions. Access is decided by
  who can reach the network, optionally plus bearer tokens. See
  [Access and security](../host/security).
- **Private network only.** Telescreen is designed for a tailnet or another
  private network. Do not expose it to the public internet: it has no built-in
  HTTPS, no rate limiting, and no login screen.
- **No built-in HTTPS.** `tailscale serve` (or your own reverse proxy) terminates
  TLS; the container speaks plain HTTP on port 8788.
- **Optional modules need credentials.** Weather needs a location, Travel needs a
  Google Maps API key, Meals needs a PantryPal server, and Music needs a Spotify
  app. Without them the modules stay hidden or report that they are not
  configured.
- **All data in one SQLite file.** The database is not encrypted as a whole;
  provider secrets inside it are encrypted with `TELESCREEN_SECRET_KEY`, so that
  key is as sensitive as the file.
- **Meals are read-only.** Telescreen reads PantryPal's plans; editing meals and
  shopping happens in PantryPal.
- **No offline mode.** The service worker caches the app shell only; calendar
  data comes from the server.

## Requirements

Docker is the only requirement to run it. pnpm and Node 22 are needed only to
develop or build the image locally. A private network such as Tailscale provides
the HTTPS URL that the PWA and wake lock expect.
