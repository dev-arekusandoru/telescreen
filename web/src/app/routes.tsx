import { createRootRoute, createRoute, Link, Outlet, redirect } from "@tanstack/react-router";
import { Shell } from "./Shell";

/** Root route: everything renders inside it. */
export const rootRoute = createRootRoute({
  component: Outlet,
  notFoundComponent: () => (
    <p style={{ padding: 32 }}>
      That page does not exist. <Link to="/calendar">Back to the calendar</Link>
    </p>
  ),
});

/** Layout route: nav rail / tab bar + page. Tabbed screens hang off this one. */
export const shellRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "shell",
  component: Shell,
});

/** `/` redirects to the calendar. */
export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({ to: "/calendar", replace: true });
  },
});
