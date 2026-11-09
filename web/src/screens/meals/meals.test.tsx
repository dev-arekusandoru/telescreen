import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, formatDate, localDate, startOfWeek } from "@/app/localdate";
import { MEMBERS, defaultSettings, renderAt } from "@/test/api";
import type { BoardDay, BoardMeal, MealsCurrent, MealsKitchen } from "@/features/meals";

const TZ = "Europe/Berlin";

function boardMeal(slot: BoardMeal["slot"], title: string, extra: Partial<BoardMeal> = {}): BoardMeal {
  return {
    slot,
    title,
    recipeId: `rcp_${title.toLowerCase().replace(/\W+/g, "_")}`,
    url: `https://pantry.example/recipes/${encodeURIComponent(title)}`,
    imageUrl: null,
    minutes: 30,
    cuisine: "Italian",
    leftover: false,
    cookedOn: null,
    ...extra,
  };
}

let today: string;
let yesterday: string;
let tomorrow: string;
let weekStart: string;
let meals: Record<string, BoardMeal[]>;
let kitchen: MealsKitchen;
let stale: boolean;

function current(): MealsCurrent {
  return {
    weekStart,
    week: Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
      .filter((date) => meals[date])
      .map((date) => ({
        date,
        meals: (meals[date] ?? []).map(({ slot, title, recipeId, url, skipped }) => ({ slot, title, recipeId, url, skipped })),
      })),
    tonight: (meals[today] ?? []).find((meal) => meal.slot === "dinner") ?? null,
    fetchedAt: new Date().toISOString(),
    stale,
  };
}

function board(start: string, end: string): { days: BoardDay[]; fetchedAt: string; stale: boolean } {
  const days: BoardDay[] = [];
  for (let date = start, i = 0; date < end; date = addDays(start, ++i)) {
    if (meals[date]) days.push({ date, meals: meals[date]! });
  }
  return { days, fetchedAt: new Date().toISOString(), stale };
}

function stubMealsApi() {
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const req = typeof input === "string" ? new Request(input, init) : input;
      const url = new URL(req.url);
      const path = url.pathname.replace("/api/v1", "");
      if (path === "/household") return json({ id: "hh", name: "Home", timezone: TZ, weekStart: 0, themeDefault: "system" });
      if (path === "/members") return json(MEMBERS);
      if (path === "/settings") {
        const settings = defaultSettings();
        return json({ ...settings, modules: { ...settings.modules, meals: true } });
      }
      if (path === "/meals/current") return json(current());
      if (path === "/meals/board") return json(board(url.searchParams.get("start")!, url.searchParams.get("end")!));
      if (path === "/meals/kitchen") return json(kitchen);
      return new Response("not found", { status: 404 });
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  today = localDate(new Date(), TZ);
  yesterday = addDays(today, -1);
  tomorrow = addDays(today, 1);
  weekStart = startOfWeek(today, 0);
  stale = false;
  meals = {
    [yesterday]: [boardMeal("dinner", "Yesterday stew")],
    [today]: [
      boardMeal("breakfast", "Overnight oats", { minutes: null, cuisine: null }),
      boardMeal("lunch", "Leftover soup", { leftover: true, cookedOn: yesterday }),
      boardMeal("dinner", "Eating out", { skipped: true, url: null, recipeId: null }),
    ],
    [tomorrow]: [boardMeal("dinner", "Lemon chicken", { minutes: 45 })],
  };
  kitchen = {
    shopping: {
      title: "Week of Nov 1",
      total: 4,
      left: 2,
      groups: [
        {
          category: "Produce",
          items: [
            { name: "Lemons", qty: "4", needsCheck: false, checked: true },
            { name: "Basil", qty: "1 bunch", needsCheck: true, checked: false },
            { name: "Apples", qty: "6", needsCheck: false, checked: false },
            { name: "Onions", qty: "3", needsCheck: false, checked: false },
          ],
        },
        { category: "Dairy", items: [{ name: "Butter", qty: "1", needsCheck: false, checked: true }] },
      ],
    },
    missing: [{ name: "Mozzarella", detail: "Pizza night · need 250 g, have 80 g" }],
    expiring: [{ name: "Spinach", expiresOn: addDays(today, 2), daysLeft: 2 }],
    fetchedAt: new Date().toISOString(),
    stale: false,
  };
  stubMealsApi();
});
afterEach(() => vi.unstubAllGlobals());

describe("meals tab", () => {
  it("shows the next cookable meal as the hero and skips today's skipped dinner", async () => {
    renderAt("/meals");
    expect(await screen.findByRole("heading", { name: "Meals" })).toBeInTheDocument();

    const hero = await screen.findByText(new RegExp("Up next · " + formatDate(tomorrow, { weekday: "long" })));
    const heroCard = hero.closest("[data-hero]")!;
    const link = heroCard.querySelector("a")!;
    expect(link).toHaveTextContent("Lemon chicken");
    expect(link).toHaveAttribute("href", "https://pantry.example/recipes/Lemon%20chicken");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noreferrer");
    expect(heroCard).toHaveTextContent("45 min");
  });

  it("marks days before today as past", async () => {
    renderAt("/meals");
    await screen.findByText(new RegExp("Up next · " + formatDate(tomorrow, { weekday: "long" })));
    expect(document.querySelector(`[data-date="${yesterday}"]`)).toHaveAttribute("data-past", "true");
    expect(document.querySelector(`[data-date="${today}"]`)).toHaveAttribute("aria-current", "date");
  });

  it("keeps the last-known notice when the board is stale", async () => {
    stale = true;
    renderAt("/meals");
    expect(await screen.findByText("Last known plan")).toBeInTheDocument();
  });

  it("renders the kitchen sidebar with aisle cuts and pantry rows", async () => {
    renderAt("/meals");
    expect(await screen.findByText("2 of 4 left")).toBeInTheDocument();
    expect(screen.getByText("+1")).toBeInTheDocument(); // one hidden Produce item
    expect(screen.queryByText("Lemons")).not.toBeInTheDocument(); // checked items hidden
    expect(screen.getByText("Mozzarella")).toBeInTheDocument();
    expect(screen.getByText("Pizza night · need 250 g, have 80 g")).toBeInTheDocument();
    expect(screen.getByText("Spinach")).toBeInTheDocument();
    expect(screen.getByText("in 2 days")).toBeInTheDocument();
  });
});
