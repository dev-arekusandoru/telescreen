import { createRoute } from "@tanstack/react-router";
import { shellRoute } from "@/app/routes";
import { CalendarScreen } from "./CalendarScreen";

export const calendarRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/calendar",
  component: CalendarScreen,
});
