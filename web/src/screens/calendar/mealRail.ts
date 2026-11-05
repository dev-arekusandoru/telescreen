import type { MealDay, MealItem } from "@/features/meals";

/** Rows reserved at the bottom of every day column (fixed, so the columns stay aligned). */
export const RAIL_ROWS = 3;

/** Badge letters, unique per slot. Dessert takes two because dinner already owns "D". */
export const SLOT_BADGE: Record<MealItem["slot"], string> = {
  breakfast: "B",
  lunch: "L",
  dinner: "D",
  snack: "S",
  dessert: "De",
};

export const SLOT_LABEL: Record<MealItem["slot"], string> = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  dessert: "Dessert",
};

/** Day date → its meals, in PantryPal's order. Days without meals are simply absent. */
export function mealsByDay(days: readonly MealDay[] | undefined): Map<string, MealItem[]> {
  const byDay = new Map<string, MealItem[]>();
  for (const day of days ?? []) {
    if (day.meals.length > 0) byDay.set(day.date, day.meals);
  }
  return byDay;
}

/** True when any day in the plan has a meal; false while loading, unreachable or a blank week. */
export function hasPlannedMeals(days: readonly MealDay[] | undefined): boolean {
  return (days ?? []).some((day) => day.meals.length > 0);
}

/**
 * The meals that fit the fixed rail height, plus how many are collapsed into the "+N more" line.
 * The extra line only appears when something would otherwise be hidden, so there is always room.
 */
export function visibleMeals(meals: readonly MealItem[]): { shown: MealItem[]; hidden: number } {
  if (meals.length <= RAIL_ROWS) return { shown: [...meals], hidden: 0 };
  const shown = meals.slice(0, RAIL_ROWS - 1);
  return { shown, hidden: meals.length - shown.length };
}
