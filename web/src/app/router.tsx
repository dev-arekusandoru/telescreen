import { createRouter } from "@tanstack/react-router";
import { calendarRoute } from "@/screens/calendar/route";
import { choresRoute } from "@/screens/chores/route";
import { mealsRoute } from "@/screens/meals/route";
import { musicRoute } from "@/screens/music/route";
import { settingsRoute } from "@/screens/settings/route";
import { indexRoute, rootRoute, shellRoute } from "./routes";

/**
 * Route tree. To add a screen: create `screens/<name>/route.tsx` (parent: `shellRoute`),
 * list it here and add a tab in `tabs.ts`.
 */
const routeTree = rootRoute.addChildren([
  indexRoute,
  shellRoute.addChildren([calendarRoute, choresRoute, mealsRoute, musicRoute, settingsRoute]),
]);

export function createAppRouter(options?: { history?: Parameters<typeof createRouter>[0]["history"] }) {
  return createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true, ...options });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
