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

export const mealsPlanSchema = z
  .object({
    days: z
      .array(mealDaySchema)
      .describe("Planned days in the requested range, oldest first. Days with no plan are omitted."),
    fetchedAt: z.string().describe("ISO instant this response was built from PantryPal."),
    stale: z
      .boolean()
      .describe("True when PantryPal is unreachable and the last good response for this range is served instead."),
  })
  .openapi("MealsPlan");

const boardMealSchema = z
  .object({
    ...mealItemFields,
    imageUrl: z.string().nullable().describe("Recipe hero image; null when the recipe has none."),
    minutes: z.number().nullable().describe("Recipe total time in minutes; null when unknown."),
    cuisine: z.string().nullable().describe("Recipe cuisine label; null when unknown."),
    leftover: z.boolean().describe("True when this slot reuses an earlier cook."),
    cookedOn: isoDate
      .nullable()
      .describe("Date of the cook this slot comes from; null when it is not a planned cook."),
  })
  .openapi("BoardMeal");

export const boardDaySchema = z
  .object({ date: isoDate, meals: z.array(boardMealSchema) })
  .openapi("BoardDay");

export const mealsBoardSchema = z
  .object({
    days: z.array(boardDaySchema).describe("Planned days in the requested range, oldest first."),
    fetchedAt: z.string().describe("ISO instant this response was built from PantryPal."),
    stale: z.boolean().describe("True when PantryPal is unreachable and the last good response is served."),
  })
  .openapi("MealsBoard");

export const mealsKitchenSchema = z
  .object({
    shopping: z
      .object({
        title: z.string(),
        total: z.number().int(),
        left: z.number().int().describe("Unchecked items remaining."),
        groups: z.array(
          z.object({
            category: z.string().describe('Display label for the aisle, e.g. "Produce".'),
            items: z.array(
              z.object({
                name: z.string(),
                qty: z.string().nullable().describe('Display quantity, e.g. "600 g"; null when unknown.'),
                needsCheck: z.boolean(),
                checked: z.boolean(),
              }),
            ),
          }),
        ),
      })
      .nullable()
      .describe("Newest open shopping list; null when there is none."),
    missing: z
      .array(
        z.object({
          name: z.string(),
          detail: z.string().describe('Server-formatted line, e.g. "Pizza night · need 250 g, have 80 g".'),
        }),
      )
      .describe("Ingredients the current plan needs and the pantry cannot cover."),
    expiring: z.array(
      z.object({
        name: z.string(),
        expiresOn: isoDate,
        daysLeft: z.number().int().describe("Negative when already expired."),
      }),
    ),
    fetchedAt: z.string(),
    stale: z.boolean().describe("True when every section failed and the last good response is served."),
  })
  .openapi("MealsKitchen");

/** Query for `/meals/plan`: a half-open date range, capped so one request cannot fan out forever. */
export const mealsPlanQuerySchema = z
  .object({
    start: isoDate.describe("First day of the range (YYYY-MM-DD), inclusive."),
    end: isoDate.describe("Last day of the range (YYYY-MM-DD), exclusive."),
  })
  .refine((range) => range.start < range.end, { message: "end must be after start", path: ["end"] })
  .refine((range) => Date.parse(range.end) - Date.parse(range.start) <= 62 * 86_400_000, {
    message: "range must be 62 days or less",
    path: ["end"],
  });

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
