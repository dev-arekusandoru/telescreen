# iCloud

iCloud calendars use CalDAV with an app-specific password. No Apple developer
account, OAuth client, or environment variable is needed: you create the
password at Apple, enter it once in Settings, and Telescreen stores it
encrypted on your server.

## Create an app-specific password

1. Sign in at [appleid.apple.com](https://appleid.apple.com/).
2. Open **Sign-In and Security > App-Specific Passwords**.
3. Create a password labelled for this device, for example `Telescreen`.
4. Copy the generated value (`xxxx-xxxx-xxxx-xxxx`). Apple shows it once.

Your normal Apple ID password does not work here, and two-factor
authentication must be enabled on the Apple ID before Apple offers app-specific
passwords.

## Connect the account

1. In Telescreen, open **Settings > Calendar > Accounts**.
2. Tap **Add iCloud**.
3. Fill in the fields:

   | Field | What to enter |
   | --- | --- |
   | Name | A label for the account, shown in Settings |
   | Apple ID | The email address of the Apple ID |
   | App-specific password | The value from appleid.apple.com |

4. Tap **Connect**.

Telescreen validates the credentials against Apple before storing anything, so
a wrong password fails in the dialog instead of appearing as a broken account.
On success it stores the account and starts the first sync in the background.
Calendars appear under **Settings > Calendar > Calendars** once the sync
finishes, where each can be enabled and mapped to a member.

## CalDAV endpoint

Telescreen talks to `https://caldav.icloud.com` and lets Apple redirect to the
account's actual server; there is no server URL to enter. Calendars are
discovered and listed over CalDAV. Sync compares each calendar's `ctag` and only
fetches objects when it changed; writes use `If-Match` with the object's
`etag`.

## Read-only calendars

Two kinds of iCloud calendar are marked read-only:

- Calendars you subscribed to (for example a holiday or sports calendar). Apple
  exposes these with the `subscribed` resource type.
- Calendars where the account has no write privilege.

They sync and display, but the event sheet cannot create or edit events in
them. Only calendars your Apple ID can write to accept changes from the wall.

## What is stored

- The Apple ID and the app-specific password, together as a JSON secret
  encrypted with AES-256-GCM using `TELESCREEN_SECRET_KEY`, in the account row
  of `telescreen.db`.
- The account label you typed, plus the sync status and last error.
- Synced calendars and cached events. No credentials or calendar data go
  anywhere except between your server and Apple.

Losing `TELESCREEN_SECRET_KEY` makes the stored password unreadable; see
[Backups and restore](../host/backups).

## Reconnect

Changing the Apple ID password, or revoking the app-specific password at
Apple, causes authentication to fail. The account badge changes to **Reconnect
needed** and the account's last error explains why.

There is no Reconnect button for iCloud. Remove the account and add it again:

1. **Settings > Calendar > Accounts**, tap the trash icon on the account.
   Telescreen forgets the account, its calendars, and cached events. Nothing is
   deleted at Apple.
2. Tap **Add iCloud** and enter the Apple ID with a current app-specific
   password.

A transient Apple outage shows **Sync problem** instead; the next poll retries
without any action.

## Limits

- Telescreen reads and writes calendars, not Reminders or Contacts.
- Calendar colours come from iCloud when set; otherwise the member colour is
  used on the wall.
- Polling follows the **Sync interval** in Settings > General (5 minutes by
  default). Telescreen also syncs when the app regains focus.
- Apple rate-limits CalDAV traffic per account. The default interval is well
  within it; shortening it to a minute or two gives little benefit.

Environment variables are not involved. Continue with
[Calendar](../use/calendar) to set up views and filters.
