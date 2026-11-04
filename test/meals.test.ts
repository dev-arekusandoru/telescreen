import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx } from "../src/context.js";
import type { Db } from "../src/db/client.js";
import { updateSettings } from "../src/services/settings.js";
import { updateHousehold } from "../src/services/households.js";
import {
  getCurrentMeals,
  getMealsStatus,
  normalizePlan,
  pantrypalConfig,
  pickTonight,
  resetMealsCache,
  testPantryPal,
  weekStartFor,
  type MealDay,
  type RawPlan,
} from "../src/services/meals.js";
import { FIXED_NOW, makeTestCtx, makeTestApp } from "./helpers.js";

const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/pantrypal-plan.json", import.meta.url), "utf8"),
) as RawPlan;

const normalizeFixture = () =>
  normalizePlan(fixture, { publicUrl: "https://pantry.example", fallbackWeekStart: "2026-11-01" });

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function enableMeals(db: Db): void {
  updateSettings(db, { modules: { weather: false, meals: true, music: false } });
}

beforeEach(() => resetMealsCache());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetMealsCache();
});

describe("normalizePlan", () => {
  it("flattens PantryPal's day grid into ordered meal items", () => {
    const { weekStart, week } = normalizeFixture();
    expect(weekStart).toBe("2026-11-02");
    expect(week).toHaveLength(7);
    expect(week[0]).toEqual({
      date: "2026-11-02",
      meals: [
        {
          slot: "breakfast",
          title: "Overnight Oats",
          recipeId: "rcp_oats",
          url: "https://pantry.example/recipes/rcp_oats",
        },
        { slot: "dinner", title: "Costco chicken Alfredo", recipeId: null, url: null },
      ],
    });
  });

  it("keeps freeform labels, marks skips and keeps days without meals", () => {
    const { week } = normalizeFixture();
    const wed = week.find((d) => d.date === "2026-11-04")!;
    expect(wed.meals).toContainEqual({ slot: "breakfast", title: "Toast and jam", recipeId: null, url: null });

    const thu = week.find((d) => d.date === "2026-11-05")!;
    expect(thu.meals).toContainEqual({
      slot: "dinner",
      title: "Eating out",
      recipeId: null,
      url: null,
      skipped: true,
    });
    expect(thu.meals.find((m) => m.slot === "lunch")?.url).toBe("https://pantry.example/recipes/rcp_soup");

    expect(week.find((d) => d.date === "2026-11-07")?.meals).toEqual([]);
  });

  it("accepts PantryPal's empty/404 case and malformed days", () => {
    expect(normalizePlan(null, { publicUrl: "http://p", fallbackWeekStart: "2026-11-01" })).toEqual({
      weekStart: "2026-11-01",
      week: [],
    });
    const partial = normalizePlan(
      {
        days: [
          { date: "not-a-date", meals: {} },
          { date: "2026-11-03", meals: { dinner: [{ kind: "meal", cookEvent: { recipeId: "rcp_x" } }] } },
          { date: "2026-11-04", meals: { lunch: [{ kind: "unknown" }] } },
        ],
      },
      { publicUrl: "http://p", fallbackWeekStart: "2026-11-01" },
    );
    expect(partial.weekStart).toBe("2026-11-03");
    expect(partial.week).toEqual([
      {
        date: "2026-11-03",
        meals: [{ slot: "dinner", title: "Planned meal", recipeId: "rcp_x", url: "http://p/recipes/rcp_x" }],
      },
      { date: "2026-11-04", meals: [] },
    ]);
  });

  it("computes a fallback week start from the household week start", () => {
    expect(weekStartFor("2026-11-03", 0)).toBe("2026-11-01");
    expect(weekStartFor("2026-11-03", 1)).toBe("2026-11-02");
  });
});

describe("pickTonight", () => {
  const { week } = normalizeFixture();

  it("picks today's dinner", () => {
    expect(pickTonight(week, "2026-11-03")?.title).toBe("Lemon chicken with roasted veg");
    expect(pickTonight(week, "2026-11-03")?.url).toBe("https://pantry.example/recipes/rcp_lemon");
  });

  it("falls back to the last non-skipped meal of the day", () => {
    expect(pickTonight(week, "2026-11-05")).toMatchObject({ slot: "lunch", title: "Chicken soup" });
  });

  it("returns null when today has no planned meal", () => {
    expect(pickTonight(week, "2026-11-07")).toBeNull();
    expect(pickTonight(week, "2026-12-01")).toBeNull();
  });

  it("ignores skipped-only days", () => {
    const skippedOnly: MealDay[] = [
      {
        date: "2026-11-06",
        meals: [{ slot: "dinner", title: "Eating out", recipeId: null, url: null, skipped: true }],
      },
    ];
    expect(pickTonight(skippedOnly, "2026-11-06")).toBeNull();
  });
});

describe("pantrypalConfig", () => {
  it("normalizes trailing slashes and defaults the public URL", () => {
    const config = pantrypalConfig({ PANTRYPAL_URL: "http://pantrypal:8787/" });
    expect(config).toEqual({ url: "http://pantrypal:8787", publicUrl: "http://pantrypal:8787", token: null });
    expect(pantrypalConfig({ PANTRYPAL_URL: "http://pantrypal:8787", PANTRYPAL_TOKEN: " sekret " })?.token).toBe(
      "sekret",
    );
    expect(pantrypalConfig({})).toBeNull();
  });
});

describe("getCurrentMeals", () => {
  it("fetches, normalizes and caches for five minutes with PantryPal's bearer scheme", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const now = new Date(FIXED_NOW);
    const ctx = makeCtx(t.db, t.household.id, () => now);
    const fetchMock = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => jsonResponse(fixture));

    const first = await getCurrentMeals(ctx, {
      env: { PANTRYPAL_URL: "http://pantrypal.test:8787/", PANTRYPAL_TOKEN: "tok" },
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(first).toMatchObject({
      weekStart: "2026-11-02",
      stale: false,
      tonight: { slot: "dinner", title: "Lemon chicken with roasted veg" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("http://pantrypal.test:8787/api/v1/plans/current");
    expect(init?.headers).toMatchObject({ authorization: "Bearer tok" });

    now.setMinutes(now.getMinutes() + 1);
    const cached = await getCurrentMeals(ctx, {
      env: { PANTRYPAL_URL: "http://pantrypal.test:8787", PANTRYPAL_TOKEN: "tok" },
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cached.stale).toBe(false);
  });

  it("serves the last good plan as stale when PantryPal fails", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const now = new Date(FIXED_NOW);
    const ctx = makeCtx(t.db, t.household.id, () => now);
    const env = { PANTRYPAL_URL: "http://pantrypal.test:8787" };
    const ok = vi.fn(async () => jsonResponse(fixture));

    const fresh = await getCurrentMeals(ctx, { env, fetch: ok as unknown as typeof fetch });
    now.setMinutes(now.getMinutes() + 10);
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const stale = await getCurrentMeals(ctx, { env, fetch: down as unknown as typeof fetch });
    expect(down).toHaveBeenCalledTimes(1);
    expect(stale.stale).toBe(true);
    expect(stale.fetchedAt).toBe(fresh.fetchedAt);
    expect(stale.week).toEqual(fresh.week);
    expect(stale.tonight?.title).toBe(fresh.tonight?.title);
  });

  it("reports 503 when there is no cached plan", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      getCurrentMeals(ctx, { env: { PANTRYPAL_URL: "http://pantrypal.test" }, fetch: down as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });

  it("treats PantryPal's 404 (no plan this week) as an empty cached week", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));
    const missing = vi.fn(async () => jsonResponse({ error: "no plan" }, 404));
    const result = await getCurrentMeals(ctx, {
      env: { PANTRYPAL_URL: "http://pantrypal.test" },
      fetch: missing as unknown as typeof fetch,
    });
    expect(result).toMatchObject({ week: [], tonight: null, stale: false });
    // Berlin, Tue 2026-11-03, household week starts Sunday.
    expect(result.weekStart).toBe("2026-11-01");
  });

  it("requires the module flag and PANTRYPAL_URL", async () => {
    const t = makeTestCtx();
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));
    const fetchMock = vi.fn(async () => jsonResponse(fixture));
    await expect(
      getCurrentMeals(ctx, { env: { PANTRYPAL_URL: "http://p" }, fetch: fetchMock as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: "not_found" });

    enableMeals(t.db);
    await expect(getCurrentMeals(ctx, { env: {}, fetch: fetchMock as unknown as typeof fetch })).rejects.toMatchObject({
      code: "unavailable",
      details: { variable: "PANTRYPAL_URL" },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("selects tonight in the household time zone", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const instant = new Date("2026-11-04T02:00:00.000Z"); // Nov 3 in Los Angeles, Nov 4 in Berlin
    const ctx = makeCtx(t.db, t.household.id, () => instant);
    const env = { PANTRYPAL_URL: "http://pantrypal.test" };
    const fetchImpl = vi.fn(async () => jsonResponse(fixture)) as unknown as typeof fetch;

    updateHousehold(ctx, { timezone: "America/Los_Angeles" });
    resetMealsCache();
    const la = await getCurrentMeals(ctx, { env, fetch: fetchImpl });
    expect(la.tonight?.title).toBe("Lemon chicken with roasted veg");

    updateHousehold(ctx, { timezone: "Europe/Berlin" });
    resetMealsCache();
    const berlin = await getCurrentMeals(ctx, { env, fetch: fetchImpl });
    expect(berlin.tonight?.title).toBe("One-pan skillet pasta");
  });
});

describe("meals routes", () => {
  it("serves the normalized week over HTTP and reports status", async () => {
    const t = makeTestApp();
    await t.request("PUT", "/api/v1/settings", {
      modules: { weather: false, meals: true, music: false },
    });
    vi.stubEnv("PANTRYPAL_URL", "http://pantrypal.test:8787");
    vi.stubEnv("PANTRYPAL_PUBLIC_URL", "https://pantry.example");
    vi.stubEnv("PANTRYPAL_TOKEN", "tok");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(fixture)));

    const current = await t.request<{
      week: Array<{ date: string; meals: Array<{ title: string; url: string | null }> }>;
      tonight: { title: string } | null;
      stale: boolean;
    }>("GET", "/api/v1/meals/current");
    expect(current.status).toBe(200);
    expect(current.body.tonight?.title).toBe("Lemon chicken with roasted veg");
    expect(current.body.stale).toBe(false);
    expect(current.body.week.find((d) => d.date === "2026-11-03")?.meals[0]?.url).toBe(
      "https://pantry.example/recipes/rcp_oats",
    );

    const status = await t.request<Record<string, unknown>>("GET", "/api/v1/meals/status");
    expect(status.body).toEqual({
      enabled: true,
      configured: true,
      url: "http://pantrypal.test:8787",
      publicUrl: "https://pantry.example",
      tokenConfigured: true,
    });
  });

  it("404s when the module is disabled and 200s the connection test", async () => {
    const t = makeTestApp();
    vi.stubEnv("PANTRYPAL_URL", "http://pantrypal.test");
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(fixture)));

    expect((await t.request("GET", "/api/v1/meals/current")).status).toBe(404);

    const result = await t.request<{ ok: boolean; message: string; weekStart: string | null }>(
      "POST",
      "/api/v1/meals/test",
    );
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ ok: true, weekStart: "2026-11-02" });
  });

  it("reports an unconfigured connection without calling out", async () => {
    const t = makeTestApp();
    vi.stubEnv("PANTRYPAL_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const status = await t.request<{ enabled: boolean; configured: boolean }>("GET", "/api/v1/meals/status");
    expect(status.body).toMatchObject({ enabled: false, configured: false });
    const result = await t.request<{ ok: boolean; message: string }>("POST", "/api/v1/meals/test");
    expect(result.body.ok).toBe(false);
    expect(result.body.message).toContain("PANTRYPAL_URL");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("getMealsStatus / testPantryPal", () => {
  it("reports configured URLs and a reachable plan", async () => {
    const t = makeTestCtx();
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));
    const env = { PANTRYPAL_URL: "http://pantrypal.test", PANTRYPAL_TOKEN: "tok" };
    expect(getMealsStatus(ctx, env)).toEqual({
      enabled: false,
      configured: true,
      url: "http://pantrypal.test",
      publicUrl: "http://pantrypal.test",
      tokenConfigured: true,
    });
    expect(await testPantryPal({ env, fetch: (async () => jsonResponse(fixture)) as unknown as typeof fetch })).toEqual({
      ok: true,
      message: "PantryPal is reachable: 7 days planned for the current week.",
      weekStart: "2026-11-02",
    });
  });

  it("reports a reachable PantryPal with no plan", async () => {
    const result = await testPantryPal({
      env: { PANTRYPAL_URL: "http://pantrypal.test" },
      fetch: (async () => jsonResponse({}, 404)) as unknown as typeof fetch,
    });
    expect(result.ok).toBe(true);
    expect(result.weekStart).toBeNull();
    expect(result.message).toContain("no plan");
  });
});
