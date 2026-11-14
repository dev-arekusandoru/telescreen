# Travel

Travel shows how long the drive from home to each saved place takes right now, based on live traffic from the Google Routes API. Rows sit in the right column, below weather, so a glance answers "when should we leave?".

## Before you start

- A Google Maps API key with the **Routes API** enabled. Put it in `GOOGLE_MAPS_API_KEY` and restart Telescreen. See [Environment variables](../reference/environment).
- A home address and at least one destination in **Settings > Travel**.
- The module switched on in **Settings > Modules > Travel**.

Without the key the API answers 503 and the card shows "Unavailable"; without a home address it answers 503 with "Set a home address in Settings."

## Settings > Travel

| Field | What it does |
|---|---|
| Travel | Enables the card and the driving-time requests. |
| Google Maps API key | Read-only status: whether `GOOGLE_MAPS_API_KEY` is set. The key itself is never shown. |
| Home | Starting address for every route, up to 200 characters. |
| Name | Destination label shown in the card, up to 40 characters. |
| Address | Free-text address, up to 200 characters; Google resolves it. |
| Icon | One of pin, home, work, school, shop, airport or gym. |
| Person | Optional household member. Their colour tints the icon; "No one" leaves it neutral. |
| Remove | Deletes the destination. |

Add a destination by filling the name and address in the last row and submitting; each new destination starts with the pin icon and no person. Up to 20 destinations are allowed; the add row disappears at the limit.

Changes take effect immediately: saving resets the travel query so the card refetches instead of showing stale rows for the old addresses.

## Reading a row

Each row is one destination:

- the icon, tinted with the assigned member's colour;
- the destination name;
- `arrival 10:37pm`, the household-local time you would arrive if you left now;
- the driving time with current traffic, such as `9 min` or `1 h 15 min`;
- a status word, plus how much traffic adds: `+12 min · Slow`.

A destination Google cannot route shows **No route** instead of a time; the badge carries the reason as a tooltip (no driving route, address not found, and so on).

| Status | When it applies |
|---|---|
| Clear | Less than five extra minutes over free-flow, or under 10% longer. |
| Slow | At least five extra minutes and 10% or more longer, but under 30% longer. |
| Heavy | 30% or more longer than free-flow. |

The duration and status text are tinted amber for slow and red for heavy. The status word and the `+N min` figure carry the same information without colour, so the row still reads correctly for anyone who cannot distinguish the tints. Delays under two minutes are not shown as a figure, so a normal commute does not flicker.

Tapping a row opens Google Maps driving directions from your home address to that destination, which hands off to the Maps app on a phone.

## Card states

| State | What you see |
|---|---|
| Loading | "Loading…" |
| No destinations | "Add destinations in Settings." |
| Upstream failure, nothing cached | "Unavailable" |
| Upstream failure, cache exists | The last rows plus a **Last known** badge in the card header |

## Caching and request volume

- The server caches a successful matrix for 10 minutes, keyed by the home address and the full destination list.
- The browser refetches on the same 10-minute cadence, so the card and the Routes API billing line move together.
- One `computeRouteMatrix` request covers every destination: it is a single origin (home) against N destinations, traffic-aware, driving. The Routes API allows up to 50 elements per request with address waypoints, so the 20-destination cap stays well inside that.
- Editing a destination, its address or the home address invalidates the card immediately and costs one request.
- If the upstream call fails and an expired result exists, it is served with `stale: true`, which is what the **Last known** badge reflects.

## Limits

- Driving only. There are no walking, cycling or transit times.
- One origin. Every row starts from the same home address.
- Addresses are free text resolved by Google; a vague address can produce a wrong route or none at all.
- Traffic is Google's estimate for leaving now. There is no departure-time planning, no history and no per-day schedule.
- Routes go through Telescreen's server, so the API key stays there; if the server cannot reach Google, the card falls back to cached rows or "Unavailable".
