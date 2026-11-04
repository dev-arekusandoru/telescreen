import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, formatDate, localDate, startOfWeek } from "@/app/localdate";
import { MEMBERS, defaultSettings, renderAt } from "@/test/api";
import type { MealsCurrent } from "@/features/meals";

const TZ = "Europe/Berlin";

function makeWeek(): MealsCurrent {
  const today = localDate(new Date(), TZ);
  const weekStart = startOfWeek(today, 0);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  return {
    weekStart,
    week: days.map((date) => ({
      date,
      meals:
        date === today
          ? [
              { slot: "breakfast", title: "Overnight Oats", recipeId: "rcp_oats", url: "https://pantry.example/recipes/rcp_oats" },
              { slot: "dinner", title: "Lemon chicken", recipeId: "rcp_lemon", url: "https://pantry.example/recipes/rcp_lemon" },
              { slot: "snack", title: "Eating out", recipeId: null, url: null, skipped: true },
            ]
          : date === days[0]
            ? [{ slot: "dinner", title: "Skillet pasta", recipeId: "rcp_pasta", url: "https://pantry.example/recipes/rcp_pasta" }]
            : [],
    })),
    tonight: { slot: "dinner", title: "Lemon chicken", recipeId: "rcp_lemon", url: "https://pantry.example/recipes/rcp_lemon" },
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
}

let meals: MealsCurrent;

function stubMealsApi() {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const req = typeof input === "string" ? new Request(input, init) : input;
      const path = new URL(req.url).pathname.replace("/api/v1", "");
      if (path === "/household") return json({ id: "hh", name: "Home", timezone: TZ, weekStart: 0, themeDefault: "system" });
      if (path === "/members") return json(MEMBERS);
      if (path === "/settings") {
        const settings = defaultSettings();
        return json({ ...settings, modules: { ...settings.modules, meals: true } });
      }
      if (path === "/meals/current") return json(meals);
      if (path === "/meals/status") {
        return json({
          enabled: true,
          configured: true,
          url: "http://pantrypal:8787",
          publicUrl: "http://pantrypal:8787",
          tokenConfigured: false,
        });
      }
      return new Response("not found", { status: 404 });
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  meals = makeWeek();
  stubMealsApi();
});
afterEach(() => vi.unstubAllGlobals());

describe("meals tab", () => {
  it("shows the week, highlights today and deep-links recipes in a new tab", async () => {
    renderAt("/meals");

    expect(await screen.findByRole("heading", { name: "Meals" })).toBeInTheDocument();
    const today = localDate(new Date(), TZ);
    const todayCard = await screen.findByRole("article", {
      name: formatDate(today, { weekday: "long", month: "long", day: "numeric" }),
    });
    expect(todayCard).toHaveAttribute("aria-current", "date");

    const link = within(todayCard).getByRole("link", { name: "Lemon chicken" });
    expect(link).toHaveAttribute("href", "https://pantry.example/recipes/rcp_lemon");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");

    expect(within(todayCard).getByText("Overnight Oats")).toBeInTheDocument();
    expect(within(todayCard).getByText("Eating out")).toBeInTheDocument();
    expect(within(todayCard).getByText("Eating out").parentElement).toHaveClass("skipped");

    // Other days exist, and days without meals say so.
    expect(screen.getAllByRole("article")).toHaveLength(7);
    expect(screen.getAllByText("No meals planned").length).toBeGreaterThan(0);
  });

  it("shows the compact tonight line and marks a stale plan", async () => {
    meals = { ...meals, stale: true };
    renderAt("/meals");
    expect(await screen.findByText("Last known plan")).toBeInTheDocument();
    // One link in the Meals tab line, one in the right-column card.
    expect(screen.getAllByRole("link", { name: "Lemon chicken" }).length).toBeGreaterThanOrEqual(2);
  });

  it("explains an empty week", async () => {
    meals = { ...meals, week: [], weekStart: localDate(new Date(), TZ), tonight: null };
    renderAt("/meals");
    expect(await screen.findByText(/No plan for this week yet/)).toBeInTheDocument();
  });
});
