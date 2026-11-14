# PantryPal

The Meals module reads meal plans, recipes, the shopping list, and pantry
warnings from a [PantryPal](https://github.com/dev-arekusandoru/pantry-pal)
server. Telescreen only reads: it never changes plans, recipes, or stock.

PantryPal is a separate application with its own container, database, and
configuration. Set it up first using the
[PantryPal documentation](https://dev-arekusandoru.github.io/pantry-pal/).

## Point Telescreen at PantryPal

Telescreen reaches PantryPal server-to-server. The address goes in `.env` on the
Telescreen side:

```bash
# Server-to-server base URL. No trailing slash is needed.
PANTRYPAL_URL=http://pantrypal:8787
# Browser-facing URL for recipe links; defaults to PANTRYPAL_URL.
PANTRYPAL_PUBLIC_URL=https://pantrypal.your-tailnet.ts.net
# Optional bearer token; leave unset in a trusted network.
# PANTRYPAL_TOKEN=
```

Then restart:

```bash
docker compose up -d
```

### Two URLs

| Variable | Used by | What it must be |
| --- | --- | --- |
| `PANTRYPAL_URL` | The Telescreen server | An address the container can reach: a Compose service name or a tailnet hostname |
| `PANTRYPAL_PUBLIC_URL` | The tablet's browser | An address the tablet can open; used for recipe deep links and week links |

They are often different. `http://pantrypal:8787` works between containers on
the same Docker network but means nothing to a browser. Setting
`PANTRYPAL_PUBLIC_URL` to the tailnet HTTPS address keeps recipe taps working
while the API stays on the internal network. It defaults to `PANTRYPAL_URL`, so
a single reachable address can serve both.

The bundled `docker-compose.yml` uses only its own default network. To resolve a
PantryPal container by name, join PantryPal's network with a
`docker-compose.override.yml`; otherwise use PantryPal's tailnet or LAN URL in
`PANTRYPAL_URL`. See [Reaching PantryPal](../host/deployment#reaching-pantrypal).

## Trust or token

PantryPal accepts three kinds of clients: a browser session, a bearer token, or
network trust.

- **Trusted network (recommended here).** When PantryPal runs with
  `PANTRYPAL_TRUST_NETWORK=1` and only the tailnet or a shared Docker network
  can reach it, leave `PANTRYPAL_TOKEN` unset. Telescreen sends no
  authorization header and PantryPal treats it as the household. Settings
  reports "No token sent".
- **Token.** If PantryPal requires authentication, create a token with
  PantryPal's CLI and set it as `PANTRYPAL_TOKEN`. Telescreen sends
  `Authorization: Bearer <token>`. Settings reports "Using the PANTRYPAL_TOKEN
  from the environment".

A password-protected PantryPal overrides trust mode, so use a token in that
case.

## Enable the module

1. Open **Settings > Modules > Meals**.
2. Turn on **PantryPal meals**. The Meals tab appears and the Tonight card
   starts reading the current plan.
3. Check the **PantryPal server** row. It shows the configured URL, the public
   URL used for recipe links, whether a token is sent, and **Test connection**.

**Test connection** fetches the current plan once, bypassing the cache, and
reports the result in a toast. It is the quickest way to confirm the address and
credentials.

## What is read

| Data | Where it appears |
| --- | --- |
| This week's plan and tonight's dinner | Tonight card, Meals tab, meal rail under the calendar |
| Plans for the visible date range | Calendar week and day views, Meals board |
| Recipe details (photo, time, cuisine, leftovers) | Meals board tiles |
| Newest open shopping list, pantry gaps, expiring food | Kitchen sidebar on the Meals tab |

Everything is read-only, including the shopping list: ticking items off happens
in PantryPal.

## Caching and staleness

Telescreen caches PantryPal responses for five minutes. When PantryPal is
unreachable, the last good response is served with `stale: true` rather than an
error, so the wall keeps showing the plan. The Meals tab and kitchen sidebar
mark stale data; recipe details are cached for an hour.

`GET /meals/kitchen` fetches its three sections independently and degrades a
failing section to empty instead of failing the whole response.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| **Settings > Modules > Meals** says **Not configured** | `PANTRYPAL_URL` unset; set it and restart the container |
| Meals tab missing | Module is off in Settings > Modules > Meals |
| 404 from `/api/v1/meals/...` | The module is disabled |
| 503, nothing cached | PantryPal is down, or the URL is wrong from inside the Telescreen container. Test with `docker compose exec telescreen node -e "fetch(process.env.PANTRYPAL_URL+'/api/v1/health').then(r=>console.log(r.status)).catch(console.error)"` |
| 401 or an authorization error in the logs | PantryPal requires a token: set `PANTRYPAL_TOKEN`, or enable `PANTRYPAL_TRUST_NETWORK=1` on PantryPal |
| Recipe taps open the wrong host | Set `PANTRYPAL_PUBLIC_URL` to the address the tablet uses |
| Plan looks old | PantryPal was unreachable; the UI marks it stale and retries every five minutes |

PantryPal's own logs and the [PantryPal troubleshooting
guide](https://dev-arekusandoru.github.io/pantry-pal/host/troubleshooting) cover
the server side.

See [Meals](../use/meals) for the screen and
[Configuration](../host/configuration) for the variables.
