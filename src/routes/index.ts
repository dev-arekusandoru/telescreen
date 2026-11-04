import type { OpenAPIHono } from "@hono/zod-openapi";
import type { AppEnv } from "../auth/middleware.js";
import { registerHealthRoutes } from "./health.js";
import { registerHouseholdRoutes } from "./household.js";
import { registerMemberRoutes } from "./members.js";
import { registerSettingsRoutes } from "./settings.js";

/** The API sub-app mounted at `/api/v1`. */
export type ApiApp = OpenAPIHono<AppEnv>;

/**
 * Route modules mounted under `/api/v1`, in order.
 *
 * To add an area: create `src/routes/<area>.ts` exporting
 * `register<Area>Routes(app: ApiApp)`, then append it here (see ARCHITECTURE.md).
 * Hono matches in registration order, so register static paths before `/:id` ones.
 */
export const routeRegistrars: Array<(app: ApiApp) => void> = [
  registerHealthRoutes,
  registerHouseholdRoutes,
  registerMemberRoutes,
  registerSettingsRoutes,
];
