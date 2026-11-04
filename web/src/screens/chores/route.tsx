import { createRoute } from "@tanstack/react-router";
import { shellRoute } from "@/app/routes";
import { ChoresScreen } from "./ChoresScreen";

export const choresRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/chores",
  component: ChoresScreen,
});
