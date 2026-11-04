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
} from "@phosphor-icons/react";
import { describe, expect, it } from "vitest";
import { weatherIcon } from "./WeatherIcon";

describe("weatherIcon", () => {
  it("switches clear and partly cloudy between sun and moon", () => {
    expect(weatherIcon("clear", true)).toBe(Sun);
    expect(weatherIcon("clear", false)).toBe(MoonStars);
    expect(weatherIcon("mainly_clear", true)).toBe(CloudSun);
    expect(weatherIcon("partly_cloudy", false)).toBe(CloudMoon);
  });

  it("maps the remaining WMO families", () => {
    expect(weatherIcon("overcast", true)).toBe(Cloud);
    expect(weatherIcon("fog", true)).toBe(CloudFog);
    expect(weatherIcon("drizzle", true)).toBe(CloudRain);
    expect(weatherIcon("rain", false)).toBe(CloudRain);
    expect(weatherIcon("showers", true)).toBe(CloudRain);
    expect(weatherIcon("snow", true)).toBe(CloudSnow);
    expect(weatherIcon("snow_showers", true)).toBe(CloudSnow);
    expect(weatherIcon("thunderstorm", true)).toBe(CloudLightning);
    expect(weatherIcon("unknown", true)).toBe(Cloud);
  });
});
