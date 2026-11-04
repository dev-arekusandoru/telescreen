import { z } from "@hono/zod-openapi";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

/** Eating occasion order matches PantryPal's `MEAL_TYPES`. */
export const mealSlotSchema = z
  .enum(["breakfast", "lunch", "dinner", "snack", "dessert"])
  .openapi("MealSlot", { description: "Eating occasion.", example: "dinner" });

/**
 * One normalized meal. PantryPal slots arrive as three kinds:
 * `meal` (a planned recipe), `freeform` (a label, no recipe) and `skip` (intentionally none).
 */
const mealItemFields = {
  slot: mealSlotSchema,
  title: z.string().describe("Display text: recipe title or the freeform/skip label."),
  recipeId: z.string().nullable().describe("PantryPal recipe id; null for freeform and skip."),
  url: z.string().nullable().describe("Deep link into the PantryPal web app; null when there is no recipe."),
  skipped: z.boolean().optional().describe("True for `skip` slots (intentionally no meal)."),
};

export const mealItemSchema = z.object(mealItemFields).openapi("MealItem");

export const mealDaySchema = z
  .object({
    date: isoDate,
    meals: z.array(mealItemSchema).describe("In PantryPal meal order; empty slots are omitted."),
  })
  .openapi("MealDay");

export const mealsCurrentSchema = z
  .object({
    weekStart: isoDate.describe("First day of the plan week (household week start)."),
    week: z.array(mealDaySchema).describe("Seven days starting at weekStart, or [] when no plan exists."),
    // Inlined (not a ref) so the generated client type is `MealItem | null`, not `MealItem & null`.
    tonight: z.object(mealItemFields).nullable().describe("Today's dinner, else the last planned meal today; null when none."),
    fetchedAt: z.string().describe("ISO instant of the PantryPal response this data came from."),
    stale: z.boolean().describe("True when PantryPal is unreachable and this is the last good response."),
  })
  .openapi("MealsCurrent");

export const mealsStatusSchema = z
  .object({
    enabled: z.boolean().describe("Settings > Modules > Meals."),
    configured: z.boolean().describe("PANTRYPAL_URL is set."),
    url: z.string().nullable().describe("PantryPal base URL from the environment."),
    publicUrl: z.string().nullable().describe("Base URL used for recipe deep links (PANTRYPAL_PUBLIC_URL or url)."),
    tokenConfigured: z.boolean().describe("PANTRYPAL_TOKEN is set (optional on a trusted network)."),
  })
  .openapi("MealsStatus");

export const mealsTestResultSchema = z
  .object({
    ok: z.boolean(),
    message: z.string(),
    weekStart: isoDate.nullable().describe("Plan week start when PantryPal answered with a plan."),
  })
  .openapi("MealsTestResult");
