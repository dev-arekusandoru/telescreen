import { createRoute } from "@tanstack/react-router";
import { shellRoute } from "@/app/routes";
import { MealsScreen } from "./MealsScreen";

/** `/meals` (Meals tab; only visible when Settings > Modules > Meals is on). */
export const mealsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/meals",
  component: MealsScreen,
});
