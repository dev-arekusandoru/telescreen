import { describe, expect, it } from "vitest";
import { pantrypalWeekUrl, type MealDay, type MealItem } from "@/features/meals";
import { RAIL_ROWS, hasPlannedMeals, mealsByDay, visibleMeals } from "./mealRail";

const meal = (slot: MealItem["slot"], title: string, extra: Partial<MealItem> = {}): MealItem => ({
  slot,
  title,
  recipeId: null,
  url: null,
  ...extra,
});

const days: MealDay[] = [
  { date: "2026-11-02", meals: [meal("breakfast", "Oats"), meal("dinner", "Pasta")] },
  { date: "2026-11-03", meals: [] },
  { date: "2026-11-04", meals: [meal("lunch", "Soup", { url: "https://pantry.example/recipes/soup" })] },
];

describe("mealsByDay", () => {
  it("groups meals by date in plan order and skips days without meals", () => {
    const byDay = mealsByDay(days);
    expect([...byDay.keys()]).toEqual(["2026-11-02", "2026-11-04"]);
    expect(byDay.get("2026-11-02")?.map((m) => m.title)).toEqual(["Oats", "Pasta"]);
    expect(byDay.has("2026-11-03")).toBe(false);
  });

  it("handles a missing plan", () => {
    expect(mealsByDay(undefined).size).toBe(0);
    expect(mealsByDay([]).size).toBe(0);
  });
});

describe("hasPlannedMeals", () => {
  it("is true only when some day actually has a meal", () => {
    expect(hasPlannedMeals(days)).toBe(true);
    expect(hasPlannedMeals([{ date: "2026-11-03", meals: [] }])).toBe(false);
    expect(hasPlannedMeals(undefined)).toBe(false);
  });

  it("counts a skip (the plan deliberately says where they are eating)", () => {
    expect(hasPlannedMeals([{ date: "2026-11-05", meals: [meal("dinner", "Eating out", { skipped: true })] }])).toBe(
      true,
    );
  });
});

describe("visibleMeals", () => {
  const many = ["breakfast", "lunch", "dinner", "snack", "dessert"] as const;
  const all = many.map((slot, index) => meal(slot, `Meal ${index}`));

  it("shows everything while it fits the reserved rows", () => {
    for (let count = 0; count <= RAIL_ROWS; count += 1) {
      const { shown, hidden } = visibleMeals(all.slice(0, count));
      expect(shown).toHaveLength(count);
      expect(hidden).toBe(0);
    }
  });

  it("keeps one row for the '+N more' line", () => {
    const { shown, hidden } = visibleMeals(all);
    expect(shown).toHaveLength(RAIL_ROWS - 1);
    expect(hidden).toBe(all.length - (RAIL_ROWS - 1));
    expect(shown.length + 1).toBe(RAIL_ROWS);
  });
});

describe("pantrypalWeekUrl", () => {
  it("links a day into PantryPal's week screen", () => {
    expect(pantrypalWeekUrl("https://pantry.example", "2026-11-04")).toBe("https://pantry.example/?week=2026-11-04");
    expect(pantrypalWeekUrl("https://pantry.example/", "2026-11-04")).toBe("https://pantry.example/?week=2026-11-04");
  });

  it("is null while the browser-facing URL is unknown", () => {
    expect(pantrypalWeekUrl(null, "2026-11-04")).toBeNull();
    expect(pantrypalWeekUrl(undefined, "2026-11-04")).toBeNull();
  });
});
