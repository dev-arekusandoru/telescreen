import { describe, expect, it } from "vitest";
import { makeTestApp } from "./helpers.js";

describe("settings", () => {
  it("returns defaults, then merges a partial PUT", async () => {
    const t = makeTestApp();
    const initial = await t.request<Record<string, unknown>>("GET", "/api/v1/settings");
    // toMatchObject (not toEqual): defaults are the contract, but new keys must not break this test.
    expect(initial.body).toMatchObject({
      weekMode: "rolling",
      idleReturnMinutes: 2,
      syncIntervalMinutes: 5,
      keepAwake: true,
      seasonalDecor: true,
      modules: { weather: false, meals: false, music: false, travel: false },
      defaultWriteCalendarId: {},
      weather: { latitude: null, longitude: null, units: "celsius", place: null, showUv: false },
    });

    const put = await t.request<Record<string, unknown>>("PUT", "/api/v1/settings", {
      weekMode: "fixed",
      modules: { weather: false, meals: true, music: false, travel: false },
      defaultWriteCalendarId: { mem_x: "cal_y" },
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ weekMode: "fixed", idleReturnMinutes: 2 });

    const again = await t.request<Record<string, unknown>>("GET", "/api/v1/settings");
    expect(again.body).toMatchObject({
      weekMode: "fixed",
      modules: { meals: true },
      defaultWriteCalendarId: { mem_x: "cal_y" },
    });
  });

  it("stores the weather location and leaves other keys alone", async () => {
    const t = makeTestApp();
    const put = await t.request("PUT", "/api/v1/settings", {
      weather: { latitude: 52.52, longitude: 13.405, units: "fahrenheit", place: "Berlin" },
    });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      weekMode: "rolling",
      weather: { latitude: 52.52, longitude: 13.405, units: "fahrenheit", place: "Berlin" },
    });

    const again = await t.request<Record<string, unknown>>("GET", "/api/v1/settings");
    expect(again.body).toMatchObject({
      weather: { latitude: 52.52, longitude: 13.405, units: "fahrenheit", place: "Berlin" },
    });
  });

  it("validates values", async () => {
    const t = makeTestApp();
    expect((await t.request("PUT", "/api/v1/settings", { weekMode: "monthly" })).status).toBe(400);
    expect((await t.request("PUT", "/api/v1/settings", { syncIntervalMinutes: 0 })).status).toBe(400);
    expect(
      (await t.request("PUT", "/api/v1/settings", {
        weather: { latitude: 100, longitude: 13, units: "celsius", place: null },
      })).status,
    ).toBe(400);
  });
});

describe("household", () => {
  it("is seeded and patchable", async () => {
    const t = makeTestApp();
    const got = await t.request<{ timezone: string }>("GET", "/api/v1/household");
    expect(got.body.timezone).toBe("Europe/Berlin");
    const patched = await t.request<{ name: string; weekStart: number }>("PATCH", "/api/v1/household", {
      name: "Casa",
      weekStart: 1,
    });
    expect(patched.body).toMatchObject({ name: "Casa", weekStart: 1 });
    expect((await t.request("PATCH", "/api/v1/household", { timezone: "Mars/Olympus" })).status).toBe(400);
  });
});
