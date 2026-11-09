import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeCtx } from "../src/context.js";
import type { Db } from "../src/db/client.js";
import { updateSettings } from "../src/services/settings.js";
import { updateHousehold } from "../src/services/households.js";
import {
  categoryLabel,
  formatQuantity,
  getCurrentMeals,
  getMealsBoard,
  getMealsKitchen,
  getMealsPlan,
  getMealsStatus,
  mergeBoardDays,
  mergePlanDays,
  normalizePlan,
  pantrypalConfig,
  pickTonight,
  recipeImageUrl,
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

describe("getMealsPlan", () => {
  const env = { PANTRYPAL_URL: "http://pantrypal.test:8787", PANTRYPAL_PUBLIC_URL: "https://pantry.example" };
  const listResponse = { items: [{ id: "plan_1", weekStart: "2026-11-02" }] };

  /** PantryPal stub: list + one plan detail, everything else 404. */
  const pantrypal = () =>
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "http://pantrypal.test:8787/api/v1/plans?from=2026-11-01&to=2026-11-08") {
        return jsonResponse(listResponse);
      }
      if (url === "http://pantrypal.test:8787/api/v1/plans/plan_1") return jsonResponse(fixture);
      return jsonResponse({ error: "not found" }, 404);
    });

  it("merges the plans overlapping the range and returns only those days", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));
    const fetchMock = pantrypal();

    const plan = await getMealsPlan(ctx, "2026-11-01", "2026-11-09", {
      env,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(plan.stale).toBe(false);
    expect(plan.days.map((d) => d.date)).toEqual([
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
    ]);
    expect(plan.days.find((d) => d.date === "2026-11-03")?.meals[0]).toMatchObject({
      slot: "breakfast",
      url: "https://pantry.example/recipes/rcp_oats",
    });

    // Same range within the TTL: served from cache (2 upstream calls once).
    await getMealsPlan(ctx, "2026-11-01", "2026-11-09", { env, fetch: fetchMock as unknown as typeof fetch });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is an empty range, not an error, when PantryPal has no plan", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));
    const empty = vi.fn(async () => jsonResponse({ items: [] }));

    const plan = await getMealsPlan(ctx, "2026-12-01", "2026-12-08", {
      env,
      fetch: empty as unknown as typeof fetch,
    });
    expect(plan).toMatchObject({ days: [], stale: false });
  });

  it("serves the last good range as stale when PantryPal fails", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const now = new Date(FIXED_NOW);
    const ctx = makeCtx(t.db, t.household.id, () => now);
    const ok = pantrypal();
    const fresh = await getMealsPlan(ctx, "2026-11-01", "2026-11-09", {
      env,
      fetch: ok as unknown as typeof fetch,
    });

    now.setMinutes(now.getMinutes() + 10);
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const stale = await getMealsPlan(ctx, "2026-11-01", "2026-11-09", {
      env,
      fetch: down as unknown as typeof fetch,
    });
    expect(stale).toMatchObject({ stale: true, fetchedAt: fresh.fetchedAt });
    expect(stale.days).toEqual(fresh.days);
  });

  it("throws 503 with no cache and 404 when the module is off", async () => {
    const t = makeTestCtx();
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(
      getMealsPlan(ctx, "2026-11-01", "2026-11-09", { env, fetch: down as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: "not_found" });

    enableMeals(t.db);
    await expect(
      getMealsPlan(ctx, "2026-11-01", "2026-11-09", { env, fetch: down as unknown as typeof fetch }),
    ).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("mergePlanDays", () => {
  it("drops days outside the range and orders the rest", () => {
    const days = mergePlanDays([fixture, fixture], {
      start: "2026-11-03",
      end: "2026-11-06",
      publicUrl: "https://pantry.example",
    });
    expect(days.map((d) => d.date)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05"]);
    expect(days[0]?.meals.length).toBeGreaterThan(0);
  });

  it("keeps a day that both plans describe once", () => {
    const days = mergePlanDays([fixture], {
      start: "2026-11-02",
      end: "2026-11-09",
      publicUrl: "https://pantry.example",
    });
    expect(days.filter((d) => d.date === "2026-11-02")).toHaveLength(1);
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

  it("serves a range of planned days and rejects malformed ranges", async () => {
    const t = makeTestApp();
    await t.request("PUT", "/api/v1/settings", {
      modules: { weather: false, meals: true, music: false },
    });
    vi.stubEnv("PANTRYPAL_URL", "http://pantrypal.test:8787");
    vi.stubEnv("PANTRYPAL_PUBLIC_URL", "https://pantry.example");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/v1/plans?from=")) {
          return jsonResponse({ items: [{ id: "plan_1", weekStart: "2026-11-02" }] });
        }
        if (url.endsWith("/api/v1/plans/plan_1")) return jsonResponse(fixture);
        return jsonResponse({ error: "not found" }, 404);
      }),
    );

    const plan = await t.request<{ days: Array<{ date: string }>; stale: boolean }>(
      "GET",
      "/api/v1/meals/plan?start=2026-11-02&end=2026-11-09",
    );
    expect(plan.status).toBe(200);
    expect(plan.body.stale).toBe(false);
    expect(plan.body.days.map((d) => d.date)).toContain("2026-11-05");

    expect((await t.request("GET", "/api/v1/meals/plan?start=2026-11-09&end=2026-11-02")).status).toBe(400);
    expect((await t.request("GET", "/api/v1/meals/plan?start=2026-09-01&end=2026-12-01")).status).toBe(400);
  });

  it("serves the enriched board and the kitchen snapshot", async () => {
    const t = makeTestApp();
    await t.request("PUT", "/api/v1/settings", {
      modules: { weather: false, meals: true, music: false },
    });
    vi.stubEnv("PANTRYPAL_URL", "http://pantrypal.test:8787");
    vi.stubEnv("PANTRYPAL_PUBLIC_URL", "https://pantry.example");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes("/api/v1/plans?from=")) return jsonResponse({ items: [{ id: "plan_1" }] });
        if (url.endsWith("/api/v1/plans/plan_1")) return jsonResponse(fixture);
        if (url.endsWith("/api/v1/plans/current")) return jsonResponse(fixture);
        if (url.endsWith("/api/v1/recipes/rcp_oats")) {
          return jsonResponse({ imageUrl: "https://cdn.example/oats.jpg", totalMinutes: 12 });
        }
        if (url.endsWith("/api/v1/shopping-lists")) return jsonResponse({ items: [] });
        if (url.includes("/api/v1/pantry/availability")) return jsonResponse({ items: [] });
        if (url.endsWith("/api/v1/pantry")) return jsonResponse({ items: [] });
        return jsonResponse({ error: "not found" }, 404);
      }),
    );

    const board = await t.request<{
      days: Array<{ date: string; meals: Array<{ slot: string; imageUrl: string | null; minutes: number | null }> }>;
    }>("GET", "/api/v1/meals/board?start=2026-11-02&end=2026-11-09");
    expect(board.status).toBe(200);
    expect(board.body.days.find((d) => d.date === "2026-11-02")?.meals[0]).toMatchObject({
      slot: "breakfast",
      imageUrl: "https://cdn.example/oats.jpg",
      minutes: 12,
    });

    const kitchen = await t.request<Record<string, unknown>>("GET", "/api/v1/meals/kitchen");
    expect(kitchen.status).toBe(200);
    expect(kitchen.body).toMatchObject({ shopping: null, missing: [], expiring: [], stale: false });

    await t.request("PUT", "/api/v1/settings", { modules: { weather: false, meals: false, music: false } });
    expect((await t.request("GET", "/api/v1/meals/board?start=2026-11-02&end=2026-11-09")).status).toBe(404);
    expect((await t.request("GET", "/api/v1/meals/kitchen")).status).toBe(404);
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

describe("mergeBoardDays / recipeImageUrl", () => {
  it("keeps left-over provenance and the range window", () => {
    const days = mergeBoardDays([fixture], {
      start: "2026-11-02",
      end: "2026-11-05",
      publicUrl: "https://pantry.example",
    });
    expect(days.map((d) => d.date)).toEqual(["2026-11-02", "2026-11-03", "2026-11-04"]);
    expect(days[0]?.meals[0]).toMatchObject({
      slot: "breakfast",
      leftover: true,
      cookedOn: "2026-11-01",
      imageUrl: null,
    });
    expect(days[1]?.meals.find((m) => m.slot === "dinner")).toMatchObject({
      leftover: false,
      cookedOn: "2026-11-03",
    });
  });

  it("resolves relative images against the public URL and drops anything else", () => {
    expect(recipeImageUrl("/uploads/oats.jpg", "https://pantry.example")).toBe(
      "https://pantry.example/uploads/oats.jpg",
    );
    expect(recipeImageUrl("https://cdn.example/oats.jpg", "https://pantry.example")).toBe(
      "https://cdn.example/oats.jpg",
    );
    expect(recipeImageUrl("data:image/png;base64,xx", "https://pantry.example")).toBeNull();
    expect(recipeImageUrl(null, "https://pantry.example")).toBeNull();
  });

  it("labels aisles and formats quantities for display", () => {
    expect(categoryLabel("canned_goods")).toBe("Canned goods");
    expect(categoryLabel("produce")).toBe("Produce");
    expect(formatQuantity(600, "g")).toBe("600 g");
    expect(formatQuantity(3, null)).toBe("3");
    expect(formatQuantity(null, "g")).toBeNull();
  });
});

describe("getMealsBoard", () => {
  const env = { PANTRYPAL_URL: "http://pantrypal.test:8787", PANTRYPAL_PUBLIC_URL: "https://pantry.example" };

  const pantrypal = () =>
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url === "http://pantrypal.test:8787/api/v1/plans?from=2026-11-02&to=2026-11-08") {
        return jsonResponse({ items: [{ id: "plan_1" }] });
      }
      if (url.endsWith("/api/v1/plans/plan_1")) return jsonResponse(fixture);
      if (url.endsWith("/api/v1/recipes/rcp_oats")) {
        return jsonResponse({ imageUrl: "/uploads/oats.jpg", totalMinutes: 10, cuisine: "Breakfast" });
      }
      if (url.endsWith("/api/v1/recipes/rcp_lemon")) throw new Error("ECONNRESET");
      return jsonResponse({ error: "not found" }, 404);
    });

  it("enriches meals with recipe details and looks each recipe up once", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));
    const fetchMock = pantrypal();

    const board = await getMealsBoard(ctx, "2026-11-02", "2026-11-09", {
      env,
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(board.stale).toBe(false);
    expect(board.days.map((d) => d.date)).toHaveLength(7);

    const mon = board.days.find((d) => d.date === "2026-11-02")!;
    expect(mon.meals[0]).toMatchObject({
      slot: "breakfast",
      imageUrl: "https://pantry.example/uploads/oats.jpg",
      minutes: 10,
      cuisine: "Breakfast",
      leftover: true,
      cookedOn: "2026-11-01",
    });

    // rcp_oats is planned twice; the recipe endpoint is asked once.
    const oatCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/recipes/rcp_oats"));
    expect(oatCalls).toHaveLength(1);

    // A recipe lookup that throws leaves the tile on its placeholder instead of failing.
    const tue = board.days.find((d) => d.date === "2026-11-03")!;
    expect(tue.meals.find((m) => m.slot === "dinner")).toMatchObject({
      title: "Lemon chicken with roasted veg",
      imageUrl: null,
      minutes: null,
      cuisine: null,
    });

    const fri = board.days.find((d) => d.date === "2026-11-06")!;
    expect(fri.meals[0]).toMatchObject({ leftover: true, cookedOn: "2026-11-04" });
  });

  it("is a 404 when the module is off", async () => {
    const t = makeTestCtx();
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));
    await expect(
      getMealsBoard(ctx, "2026-11-02", "2026-11-09", {
        env,
        fetch: pantrypal() as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("getMealsKitchen", () => {
  const env = { PANTRYPAL_URL: "http://pantrypal.test:8787", PANTRYPAL_PUBLIC_URL: "https://pantry.example" };

  const shoppingLists = {
    items: [
      { id: "list_draft", status: "draft", updatedAt: "2026-11-01T10:00:00.000Z" },
      { id: "list_open", status: "shopping", updatedAt: "2026-11-02T10:00:00.000Z" },
      { id: "list_done", status: "done", updatedAt: "2026-11-05T10:00:00.000Z" },
    ],
  };

  const shoppingDetail = {
    list: { id: "list_open", title: "Food run", status: "shopping" },
    groups: [
      {
        category: "produce",
        items: [
          { name: "Apples", qty: 3, unit: null, needsCheck: false, checkedAt: null },
          { name: "Kale", qty: 600, unit: "g", needsCheck: true, checkedAt: "2026-11-02T11:00:00.000Z" },
        ],
      },
    ],
    counts: { total: 2, checked: 1, remaining: 1, needsCheck: 1 },
  };

  const availability = {
    items: [
      {
        ingredientName: "Flour",
        unit: "g",
        onHand: 80,
        onHandStatus: "low",
        committed: 250,
        available: -170,
        comparable: true,
        committedBy: [{ recipeTitle: "Pizza night" }],
      },
      {
        ingredientName: "Apples",
        unit: null,
        onHand: null,
        onHandStatus: "out",
        committed: 2,
        available: null,
        comparable: false,
        committedBy: [{ recipeTitle: "Pie" }, { recipeTitle: "Tart" }],
      },
      {
        ingredientName: "Butter",
        unit: "g",
        onHand: 500,
        onHandStatus: "on_hand",
        committed: 100,
        available: 400,
        comparable: true,
        committedBy: [{ recipeTitle: "Toast" }],
      },
    ],
  };

  const pantry = {
    items: [
      { ingredient: { name: "Yogurt" }, expiresOn: "2026-11-06" },
      { ingredient: { name: "Milk" }, expiresOn: "2026-11-01" },
      { ingredient: { name: "Rice" }, expiresOn: "2026-12-01" },
      { ingredient: { name: "Salt" }, expiresOn: null },
    ],
  };

  const pantrypal = (overrides: { pantry?: () => Response } = {}) =>
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/v1/shopping-lists")) return jsonResponse(shoppingLists);
      if (url.endsWith("/api/v1/shopping-lists/list_open")) return jsonResponse(shoppingDetail);
      if (url.endsWith("/api/v1/plans/current")) return jsonResponse(fixture);
      if (url.endsWith("/api/v1/pantry/availability?mealPlanId=plan_fixture")) return jsonResponse(availability);
      if (url.endsWith("/api/v1/pantry")) return overrides.pantry ? overrides.pantry() : jsonResponse(pantry);
      return jsonResponse({ error: "not found" }, 404);
    });

  it("picks the newest open list and groups it by aisle", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));
    const fetchMock = pantrypal();

    const kitchen = await getMealsKitchen(ctx, { env, fetch: fetchMock as unknown as typeof fetch });
    expect(kitchen.stale).toBe(false);
    expect(kitchen.shopping).toEqual({
      title: "Food run",
      total: 2,
      left: 1,
      groups: [
        {
          category: "Produce",
          items: [
            { name: "Apples", qty: "3", needsCheck: false, checked: false },
            { name: "Kale", qty: "600 g", needsCheck: true, checked: true },
          ],
        },
      ],
    });
    const draftCalls = fetchMock.mock.calls.filter(([input]) => String(input).includes("/shopping-lists/list_draft"));
    expect(draftCalls).toHaveLength(0);
  });

  it("computes the plan's pantry gaps and the five-day expiry window", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));

    const kitchen = await getMealsKitchen(ctx, { env, fetch: pantrypal() as unknown as typeof fetch });
    expect(kitchen.missing).toEqual([
      { name: "Apples", detail: "Pie (+1 more) · need 2, have none" },
      { name: "Flour", detail: "Pizza night · need 250 g, have 80 g" },
    ]);
    // Berlin "today" is 2026-11-03; the expired row stays, the far-future one drops.
    expect(kitchen.expiring).toEqual([
      { name: "Milk", expiresOn: "2026-11-01", daysLeft: -2 },
      { name: "Yogurt", expiresOn: "2026-11-06", daysLeft: 3 },
    ]);
  });

  it("degrades a failing section to empty instead of failing", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));

    const kitchen = await getMealsKitchen(ctx, {
      env,
      fetch: pantrypal({
        pantry: () => {
          throw new Error("ECONNREFUSED");
        },
      }) as unknown as typeof fetch,
    });
    expect(kitchen.expiring).toEqual([]);
    expect(kitchen.shopping?.title).toBe("Food run");
    expect(kitchen.missing).toHaveLength(2);
  });

  it("returns a null list when only a finished list exists", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));
    const onlyDone = vi.fn(async (input: string | URL | Request) => {
      if (String(input).endsWith("/api/v1/shopping-lists")) {
        return jsonResponse({ items: [{ id: "list_done", status: "done", updatedAt: "2026-11-05T10:00:00.000Z" }] });
      }
      return jsonResponse({ error: "not found" }, 404);
    });

    const kitchen = await getMealsKitchen(ctx, { env, fetch: onlyDone as unknown as typeof fetch });
    expect(kitchen).toMatchObject({ shopping: null, missing: [], expiring: [], stale: false });
  });

  it("is a 404 when the module is off and 503 when nothing answers and nothing is cached", async () => {
    const t = makeTestCtx();
    const ctx = makeCtx(t.db, t.household.id, () => new Date(FIXED_NOW));
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    await expect(getMealsKitchen(ctx, { env, fetch: down as unknown as typeof fetch })).rejects.toMatchObject({
      code: "not_found",
    });

    enableMeals(t.db);
    await expect(getMealsKitchen(ctx, { env, fetch: down as unknown as typeof fetch })).rejects.toMatchObject({
      code: "unavailable",
    });
  });

  it("serves the last good snapshot as stale when PantryPal goes down", async () => {
    const t = makeTestCtx();
    enableMeals(t.db);
    const now = new Date(FIXED_NOW);
    const ctx = makeCtx(t.db, t.household.id, () => now);
    const fresh = await getMealsKitchen(ctx, { env, fetch: pantrypal() as unknown as typeof fetch });

    now.setMinutes(now.getMinutes() + 10);
    const down = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const stale = await getMealsKitchen(ctx, { env, fetch: down as unknown as typeof fetch });
    expect(stale).toMatchObject({ stale: true, fetchedAt: fresh.fetchedAt });
    expect(stale.shopping).toEqual(fresh.shopping);
  });
});
