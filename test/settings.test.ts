import { describe, expect, it } from "vitest";
import { makeTestApp } from "./helpers.js";

describe("settings", () => {
  it("returns defaults, then merges a partial PUT", async () => {
    const t = makeTestApp();
    const initial = await t.request<Record<string, unknown>>("GET", "/api/v1/settings");
    expect(initial.body).toEqual({
      weekMode: "rolling",
      idleReturnMinutes: 2,
      syncIntervalMinutes: 5,
      modules: { weather: false, meals: false, music: false },
      defaultWriteCalendarId: {},
    });

    const put = await t.request<Record<string, unknown>>("PUT", "/api/v1/settings", {
      weekMode: "fixed",
      modules: { weather: false, meals: true, music: false },
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

  it("validates values", async () => {
    const t = makeTestApp();
    expect((await t.request("PUT", "/api/v1/settings", { weekMode: "monthly" })).status).toBe(400);
    expect((await t.request("PUT", "/api/v1/settings", { syncIntervalMinutes: 0 })).status).toBe(400);
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
