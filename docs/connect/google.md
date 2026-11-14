# Google Calendar

Telescreen reads and writes Google calendars through your own Google Cloud
project. You create an OAuth client, put its credentials in `.env`, restart, and
connect the account from Settings. There is no shared Telescreen service and no
credential leaves your server.

Google is optional: when `GOOGLE_CLIENT_ID` is unset, tapping **Add Google**
reports that Google is not configured and only iCloud accounts can be
connected.

## Create the OAuth client

1. Open the [Google Cloud console](https://console.cloud.google.com/) and create
   a project (or pick an existing one).
2. Go to **APIs & Services > Library**, search for **Google Calendar API**, and
   click **Enable**.
3. Go to **APIs & Services > OAuth consent screen**. Choose **External**, fill in
   the app name and support email, and add the scope
   `https://www.googleapis.com/auth/calendar`.
4. Under **Publishing status**, publish the app so it is **In production**.
   While the app stays in **Testing**, Google expires refresh tokens after seven
   days and the account needs reconnecting every week.
5. Go to **APIs & Services > Credentials > Create credentials > OAuth client
   ID**, choose **Web application**, and add an authorized redirect URI (below).
6. Copy the client ID and client secret.

The calendar scope is read/write. Telescreen creates, edits, and deletes events
from the wall, so a read-only scope would break those actions.

## Redirect URI

Telescreen builds the redirect URI as
`${TELESCREEN_PUBLIC_URL}/auth/google/callback`, or uses
`GOOGLE_REDIRECT_URI` when set. Register exactly the same string in the Google
client; Google compares it character for character.

| Situation | Redirect URI to register |
| --- | --- |
| Tailnet HTTPS on port 443 | `https://machine.your-tailnet.ts.net/auth/google/callback` |
| Tailnet HTTPS on another port | `https://machine.your-tailnet.ts.net:8444/auth/google/callback` |
| Fallback for the host itself | `http://localhost:8788/auth/google/callback` |

The port is part of the URI. If `tailscale serve --bg --https=8444 8788` serves
the app, set `TELESCREEN_PUBLIC_URL=https://machine.your-tailnet.ts.net:8444`
and register the URI with `:8444`.

Google may reject a tailnet hostname on the consent screen. If it does, use the
localhost fallback: register `http://localhost:8788/auth/google/callback`, set
`GOOGLE_REDIRECT_URI` to it, and run the one-time connection from a browser on
the machine that runs the container. After the account is stored, the tablet
does not need to repeat the flow.

## Configure the server

Add the credentials to `.env` next to `docker-compose.yml`:

```bash
TELESCREEN_PUBLIC_URL=https://machine.your-tailnet.ts.net
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
# Only when the registered URI differs from ${TELESCREEN_PUBLIC_URL}/auth/google/callback:
# GOOGLE_REDIRECT_URI=http://localhost:8788/auth/google/callback
```

Restart the container so the new environment is read:

```bash
docker compose up -d
```

## Connect the account

1. Open Telescreen and go to **Settings > Calendar > Accounts**.
2. Tap **Add Google**. The browser goes to Google's consent screen.
3. Google warns that the app is unverified because you did not submit it for
   review. Choose **Advanced > Go to your project (unsafe)**. It is your own
   client, so the warning is expected.
4. Grant calendar access. The browser returns to `/settings` and the first sync
   starts in the background. Calendars appear under **Settings > Calendar >
   Calendars** after that sync, where you can enable each one and map it to a
   member.

If the flow fails, the browser shows a server-rendered error page with a link
back to Settings. Fix the cause and start again from Accounts.

## What is stored

- The OAuth **refresh token**, encrypted with AES-256-GCM using
  `TELESCREEN_SECRET_KEY`, in the account row of `telescreen.db`.
- The account label (the Google account's primary calendar id, usually the
  email address) and sync status.
- Access tokens only in memory; they are refreshed as needed.

The client secret stays in `.env`. The refresh token is never returned by the
API.

## Read-only calendars

Google calendars shared with you as **Reader** (or free/busy only) are synced
but marked read-only. Events from them appear on the wall, but the event sheet
will not write to them. Calendars you own or can write to accept new events.

## Reconnect

The account status shows **Reconnect needed** when Google revokes or expires
the refresh token — for example after changing the Google password, removing
Telescreen from the account's third-party access, or after seven days in
Testing mode. Tap **Reconnect** on the account row, or use **Add Google** again;
the existing account is updated rather than duplicated.

## Limits

- One Google account produces one account entry. You can connect several
  Google accounts; each keeps its own label.
- Google's Calendar API quotas apply to your project, not to Telescreen. Normal
  household use is far below them.
- Calendar polling uses the **Sync interval** in Settings > General (5 minutes
  by default). A manual sync is available from the account row.
- Writes go to Google first and then to the local cache. An event edited
  elsewhere between polls can return `409 conflict`; reload the event and try
  again.

See [Configuration](../host/configuration) for every variable and
[Troubleshooting](../host/troubleshooting) when the callback fails.
