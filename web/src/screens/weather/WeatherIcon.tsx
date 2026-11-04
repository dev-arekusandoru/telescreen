import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  MoonStars,
  Sun,
  type Icon,
} from "@phosphor-icons/react";
import type { Weather } from "@/features/weather";

type Group = Weather["current"]["group"];

/**
 * WMO condition family -> Phosphor icon (regular weight, fill where the app uses it).
 * `isDay` picks the sun/moon variant for clear and partly cloudy skies.
 */
export function weatherIcon(group: Group, isDay: boolean): Icon {
  switch (group) {
    case "clear":
      return isDay ? Sun : MoonStars;
    case "mainly_clear":
    case "partly_cloudy":
      return isDay ? CloudSun : CloudMoon;
    case "fog":
      return CloudFog;
    case "drizzle":
    case "rain":
    case "showers":
      return CloudRain;
    case "snow":
    case "snow_showers":
      return CloudSnow;
    case "thunderstorm":
      return CloudLightning;
    case "overcast":
    case "unknown":
    default:
      return Cloud;
  }
}
