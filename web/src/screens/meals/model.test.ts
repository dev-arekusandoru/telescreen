import { describe, expect, it } from "vitest";
import type { BoardDay, BoardMeal, MealsKitchen } from "@/features/meals";
import { PAGE_MAX, PAGE_MIN, expiryLabel, pageStart, pickHero, placeholderFor, shoppingGroups } from "./model";

const meal = (slot: BoardMeal["slot"], title: string, extra: Partial<BoardMeal> = {}): BoardMeal => ({
  slot,
  title,
  recipeId: null,
  url: null,
  imageUrl: null,
  minutes: null,
  cuisine: null,
  leftover: false,
  cookedOn: null,
  ...extra,
});

const day = (date: string, meals: BoardMeal[]): BoardDay => ({ date, meals });

describe("pickHero", () => {
  const today = "2026-11-02";

  it("labels today's dinner 'Tonight'", () => {
    expect(pickHero(today, [day(today, [meal("dinner", "Pasta")]), day("2026-11-03", [meal("dinner", "Soup")])], [])).toMatchObject({
      meal: { title: "Pasta" },
      label: "Tonight",
    });
  });

  it("skips today's skipped dinner and takes the next real dinner", () => {
    const pick = pickHero(
      today,
      [day(today, [meal("dinner", "Eating out", { skipped: true })]), day("2026-11-03", [meal("dinner", "Soup")])],
      [],
    );
    expect(pick).toMatchObject({ meal: { title: "Soup" }, date: "2026-11-03", label: "Up next · Tuesday" });
  });

  it("prefers a non-leftover dinner before any other meal", () => {
    const pick = pickHero(
      today,
      [
        day(today, [meal("breakfast", "Oats"), meal("dinner", "Leftover stew", { leftover: true, cookedOn: "2026-11-01" })]),
        day("2026-11-03", [meal("dinner", "Soup")]),
      ],
      [],
    );
    expect(pick?.meal.title).toBe("Soup");
  });

  it("falls back to another slot, then to any non-skipped meal", () => {
    expect(pickHero(today, [day(today, [meal("breakfast", "Oats", { skipped: true }), meal("lunch", "Soup")])], [])?.meal.title).toBe(
      "Soup",
    );
    expect(
      pickHero(today, [day(today, [meal("dinner", "Out", { skipped: true }), meal("snack", "Cake", { leftover: true })])], [])
        ?.meal.title,
    ).toBe("Cake");
  });

  it("looks into next week when this week is empty ahead of today", () => {
    const pick = pickHero(today, [day(today, [])], [day("2026-11-09", [meal("dinner", "Next week dinner")])]);
    expect(pick).toMatchObject({ meal: { title: "Next week dinner" }, date: "2026-11-09" });
  });

  it("ignores days before today and returns null when everything is skipped", () => {
    expect(pickHero(today, [day("2026-11-01", [meal("dinner", "Past")]), day(today, [meal("dinner", "Skip", { skipped: true })])], [])).toBeNull();
  });
});

describe("week paging", () => {
  const today = "2026-11-04"; // Wednesday

  it("starts pages on the household week start", () => {
    expect(pageStart(today, 0, 0)).toBe("2026-11-01");
    expect(pageStart(today, 1, 0)).toBe("2026-11-02");
  });

  it("spans the allowed range around the current week", () => {
    expect(pageStart(today, 0, PAGE_MIN)).toBe("2026-10-04");
    expect(pageStart(today, 0, PAGE_MAX)).toBe("2026-12-27");
  });
});

describe("expiryLabel", () => {
  it("reads naturally for past, today, tomorrow and later", () => {
    expect(expiryLabel(-2)).toBe("expired");
    expect(expiryLabel(0)).toBe("today");
    expect(expiryLabel(1)).toBe("tomorrow");
    expect(expiryLabel(4)).toBe("in 4 days");
  });
});

describe("placeholderFor", () => {
  it("is deterministic and stays in range", () => {
    const first = placeholderFor("Lemon chicken");
    expect(placeholderFor("Lemon chicken")).toEqual(first);
    expect(first.hue).toBeGreaterThanOrEqual(0);
    expect(first.hue).toBeLessThan(360);
    expect(first.emoji.length).toBeGreaterThan(0);
  });
});

describe("shoppingGroups", () => {
  const shopping: MealsKitchen["shopping"] = {
    title: "Week of Nov 1",
    total: 4,
    left: 3,
    groups: [
      {
        category: "Produce",
        items: [
          { name: "Lemons", qty: "4", needsCheck: false, checked: true },
          { name: "Onions", qty: "3", needsCheck: false, checked: false },
          { name: "Basil", qty: null, needsCheck: true, checked: false },
          { name: "Apples", qty: "6", needsCheck: false, checked: false },
        ],
      },
      { category: "Dairy", items: [{ name: "Butter", qty: "1", needsCheck: false, checked: true }] },
    ],
  };

  it("hides checked items, limits each aisle and counts the rest", () => {
    expect(shoppingGroups(shopping, 2)).toEqual([
      {
        category: "Produce",
        items: [
          { name: "Onions", qty: "3", needsCheck: false, checked: false },
          { name: "Basil", qty: null, needsCheck: true, checked: false },
        ],
        more: 1,
      },
    ]);
  });
});
