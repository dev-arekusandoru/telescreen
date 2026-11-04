import { createRoute } from "@hono/zod-openapi";
import {
  accountIdParamSchema,
  accountListSchema,
  accountSchema,
  createIcloudAccountSchema,
  googleStartSchema,
  syncStatusSchema,
} from "../schemas/calendar.js";
import { createIcloudAccount, deleteAccount, getAccountRow, listAccounts, startGoogleAuth } from "../services/accounts.js";
import { getSyncStatus, syncAccount, syncAll } from "../services/sync.js";
import type { ApiApp } from "./index.js";
import { json } from "./util.js";

const tags = ["accounts"];

const listRoute = createRoute({
  method: "get",
  path: "/accounts",
  tags,
  summary: "List connected calendar accounts",
  description: "Never includes credentials.",
  responses: { 200: { description: "Accounts", content: json(accountListSchema) } },
});

const icloudRoute = createRoute({
  method: "post",
  path: "/accounts/icloud",
  tags,
  summary: "Connect an iCloud account",
  description:
    "Validates the Apple ID + app-specific password against caldav.icloud.com, stores them encrypted, and starts a first sync in the background.",
  request: { body: { content: json(createIcloudAccountSchema), required: true } },
  responses: { 201: { description: "Connected account", content: json(accountSchema) } },
});

const googleStartRoute = createRoute({
  method: "post",
  path: "/accounts/google/start",
  tags,
  summary: "Start Google OAuth",
  description: "Returns the Google consent URL; the browser comes back through /auth/google/callback.",
  responses: { 200: { description: "Consent URL", content: json(googleStartSchema) } },
});

const deleteRoute = createRoute({
  method: "delete",
  path: "/accounts/{id}",
  tags,
  summary: "Disconnect an account",
  description: "Removes the account, its calendars and cached events. Nothing is deleted at the provider.",
  request: { params: accountIdParamSchema },
  responses: { 204: { description: "Removed" } },
});

const syncOneRoute = createRoute({
  method: "post",
  path: "/accounts/{id}/sync",
  tags,
  summary: "Sync one account now",
  request: { params: accountIdParamSchema },
  responses: { 200: { description: "Sync status afterwards", content: json(syncStatusSchema) } },
});

const syncAllRoute = createRoute({
  method: "post",
  path: "/sync",
  tags,
  summary: "Sync every account now",
  description: "Used when the app regains focus.",
  responses: { 200: { description: "Sync status afterwards", content: json(syncStatusSchema) } },
});

const statusRoute = createRoute({
  method: "get",
  path: "/sync/status",
  tags,
  summary: "Sync status",
  description: "Drives the header indicator.",
  responses: { 200: { description: "Status", content: json(syncStatusSchema) } },
});

export function registerAccountRoutes(app: ApiApp): void {
  app.openapi(listRoute, (c) => c.json(listAccounts(c.var.ctx.db), 200));
  app.openapi(icloudRoute, async (c) => {
    const ctx = c.var.ctx;
    const account = await createIcloudAccount(ctx, c.req.valid("json"));
    void syncAccount(ctx, account.id);
    return c.json(account, 201);
  });
  app.openapi(googleStartRoute, (c) => c.json(startGoogleAuth(c.var.ctx), 200));
  app.openapi(deleteRoute, (c) => {
    deleteAccount(c.var.ctx.db, c.req.valid("param").id);
    return c.body(null, 204);
  });
  app.openapi(syncOneRoute, async (c) => {
    const ctx = c.var.ctx;
    const { id } = c.req.valid("param");
    getAccountRow(ctx.db, id);
    await syncAccount(ctx, id);
    return c.json(getSyncStatus(ctx.db), 200);
  });
  app.openapi(syncAllRoute, async (c) => {
    await syncAll(c.var.ctx);
    return c.json(getSyncStatus(c.var.ctx.db), 200);
  });
  app.openapi(statusRoute, (c) => c.json(getSyncStatus(c.var.ctx.db), 200));
}
