import { createRoute } from "@tanstack/react-router";
import { shellRoute } from "@/app/routes";
import { SettingsScreen } from "./SettingsScreen";

export const settingsRoute = createRoute({
  getParentRoute: () => shellRoute,
  path: "/settings",
  component: SettingsScreen,
});
