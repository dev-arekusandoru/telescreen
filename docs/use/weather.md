# Weather

Weather shows current conditions and a short forecast for one place, using [Open-Meteo](https://open-meteo.com). No account or API key is involved: the only thing to configure is where you are.

## Set it up

1. Open **Settings > Modules > Weather**.
2. Turn on **Weather**.
3. Set a location: either **Use this device's location**, or type coordinates.
4. Optionally set a place label and pick units.

| Field | What it does |
|---|---|
| Weather | Enables the forecast card and the header chip. |
| Location | Shows the place label and coordinates. **Use this device's location** asks the browser for a position and stores it rounded to four decimals. It needs HTTPS (or `localhost`) because browsers only share location in a secure context, and it requires permission. |
| Coordinates | Latitude (-90 to 90) and longitude (-180 to 180) in decimal degrees, committed when you leave the field or press Enter. An empty field clears that value. |
| Place label | Optional text up to 80 characters, shown with the forecast, for example "Home". |
| Units | Celsius or Fahrenheit. |
| UV index | Shows the current UV level under the temperature. |

Leaving latitude or longitude empty means no location, and the API answers 503 with "Set a weather location in Settings."

## Where it appears

- **Right-column card** on wide screens (width 1280 px and up), at the top of the column, above travel, tonight and now playing.
- **Header chip** on the calendar, when the right column is hidden and the chip fits. It shows the condition icon and temperature; tapping it opens a popover with exactly the same content as the card, so the two never disagree.

The card and the chip disappear while the module is off.

## What the card shows

The hero has the condition icon, the current temperature, the condition label and today's high and low.

Under it, one line: if any of the next six hours has a 50% or higher chance of precipitation, it reads `Rain ~14:00 · 60%`; otherwise it shows the next sun event, `Sunrise 06:42` or `Sunset 20:15`, taken from the first day/night flip in the hourly data. When the UV switch is on and the current UV is at least 1, a chip adds `UV 4 · Moderate`.

### Daily rows

The default forecast view is five rows, the first labelled **Today**, each with the day name, condition icon, precipitation chance, low, a bar and high. All five bars share one scale across the week's minimum and maximum, so you can compare days at a glance.

### Hourly strip

Tap the forecast to swap the rows for a horizontally scrolling strip of the next 24 hours: the current hour labelled **Now**, then condition icon, temperature and precipitation chance where it is above zero. Tap again to go back. The same swap is available from the keyboard through a hidden button, and the container animates to the height of the active view.

## Caching and failures

- A successful forecast is cached on the server for 15 minutes, keyed by location, units and time zone. The browser also refetches every 15 minutes.
- Changing units or coordinates means a new upstream request; changing only the place label is applied to the cached forecast.
- If Open-Meteo fails and a cached forecast exists, it is served marked stale, and the card adds "Showing the last update — weather is offline."
- If Open-Meteo fails with no cache, the card reads "Unavailable". The API answers 503 when the module is off, when no location is set, or when upstream fails with nothing cached.

## Limits

- Forecasts are five days and 24 hours. There is no radar, no severe-weather alerting and no historical data.
- Days are grouped in the household time zone (set in [Settings](settings)), not the device's.
- Sunrise and sunset come from the hourly day/night flag, so they are accurate to the hour, not the minute.
- Conditions are Open-Meteo's WMO code, mapped to a label and an icon family; codes outside the mapping show as "Unknown".
- Device location is only as good as the browser's position fix. If the tablet moves rooms or the browser cannot get a fix, set coordinates by hand.
- The browser stores nothing of its own; every reading comes from the server. A server that cannot reach Open-Meteo and has no cached forecast shows "Unavailable" rather than old numbers.
