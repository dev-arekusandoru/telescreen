import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { CaldavProvider, type CaldavSecret } from "../calendar/caldav.js";
import {
  GOOGLE_AUTH_URL,
  GOOGLE_SCOPE,
  GoogleProvider,
  exchangeGoogleCode,
  googleConfig,
  type GoogleSecret,
} from "../calendar/google.js";
import { ProviderAuthError, ProviderError, type Provider } from "../calendar/provider.js";
import type { Ctx } from "../context.js";
import type { Db } from "../db/client.js";
import { accounts } from "../db/schema.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
import { AppError } from "../lib/errors.js";
import { newId } from "../lib/ids.js";
import type { CreateIcloudAccountInput } from "../schemas/calendar.js";

type AccountRow = typeof accounts.$inferSelect;

export interface AccountView {
  id: string;
  provider: "google" | "icloud";
  label: string;
  status: "ok" | "error" | "needs_auth";
  lastError: string | null;
}

/** Never includes `secretEncrypted`. */
function toView(row: AccountRow): AccountView {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    status: row.status === "disabled" ? "error" : row.status,
    lastError: row.lastError,
  };
}

export function listAccounts(db: Db): AccountView[] {
  return db.select().from(accounts).all().map(toView);
}

export function getAccountRow(db: Db, id: string): AccountRow {
  const row = db.select().from(accounts).where(eq(accounts.id, id)).get();
  if (!row) throw new AppError("not_found", "Account not found");
  return row;
}

/** Provider client for an account row (decrypts its secret). */
export function providerFor(row: AccountRow): Provider {
  const secret = JSON.parse(decryptSecret(row.secretEncrypted)) as unknown;
  if (row.provider === "icloud") return new CaldavProvider(secret as CaldavSecret);
  const config = googleConfig();
  if (!config) throw new AppError("unprocessable", "Google is not configured (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)");
  return new GoogleProvider(secret as GoogleSecret, config);
}

/** Translate provider failures into API errors. */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof ProviderAuthError) return new AppError("provider_error", error.message);
  if (error instanceof ProviderError) return new AppError("provider_error", error.message);
  return new AppError("provider_error", error instanceof Error ? error.message : "Provider request failed");
}

export async function createIcloudAccount(
  ctx: Ctx,
  input: CreateIcloudAccountInput,
): Promise<AccountView> {
  const secret: CaldavSecret = { appleId: input.appleId, appPassword: input.appPassword };
  // Validate before storing anything.
  try {
    await new CaldavProvider(secret).listCalendars();
  } catch (e) {
    if (e instanceof ProviderAuthError) throw new AppError("unprocessable", e.message);
    throw toAppError(e);
  }
  const row: AccountRow = {
    id: newId("acc"),
    provider: "icloud",
    label: input.label,
    secretEncrypted: encryptSecret(JSON.stringify(secret)),
    status: "ok",
    lastError: null,
  };
  ctx.db.insert(accounts).values(row).run();
  return toView(row);
}

// -- Google OAuth -------------------------------------------------------------

const STATE_TTL_MS = 10 * 60_000;
const pendingStates = new Map<string, number>();

/** URL to send the browser to for Google consent. The `state` nonce is checked in the callback. */
export function startGoogleAuth(ctx: Ctx): { authUrl: string } {
  const config = googleConfig();
  if (!config) {
    throw new AppError(
      "unprocessable",
      "Google is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see the documentation).",
    );
  }
  const nowMs = ctx.now().getTime();
  for (const [s, exp] of pendingStates) if (exp < nowMs) pendingStates.delete(s);
  const state = randomBytes(24).toString("base64url");
  pendingStates.set(state, nowMs + STATE_TTL_MS);
  const url = new URL(GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return { authUrl: url.toString() };
}

/** Finish the OAuth flow: validate state, exchange the code, store the account. */
export async function completeGoogleAuth(ctx: Ctx, code: string, state: string): Promise<AccountView> {
  const exp = pendingStates.get(state);
  pendingStates.delete(state);
  if (exp === undefined || exp < ctx.now().getTime()) {
    throw new AppError("validation", "This sign-in link expired. Start again from Settings.");
  }
  const config = googleConfig();
  if (!config) throw new AppError("unprocessable", "Google is not configured");
  let tokens;
  try {
    tokens = await exchangeGoogleCode(config, code);
  } catch (e) {
    throw toAppError(e);
  }
  const secret: GoogleSecret = { refreshToken: tokens.refreshToken };
  let label = "Google";
  try {
    label = (await new GoogleProvider(secret, config).primaryCalendarId()) ?? label;
  } catch {
    // Label is cosmetic; keep the default.
  }
  const existing = ctx.db.select().from(accounts).where(eq(accounts.provider, "google")).all().find((a) => a.label === label);
  const encrypted = encryptSecret(JSON.stringify(secret));
  if (existing) {
    ctx.db.update(accounts).set({ secretEncrypted: encrypted, status: "ok", lastError: null }).where(eq(accounts.id, existing.id)).run();
    return toView({ ...existing, status: "ok", lastError: null });
  }
  const row: AccountRow = {
    id: newId("acc"),
    provider: "google",
    label,
    secretEncrypted: encrypted,
    status: "ok",
    lastError: null,
  };
  ctx.db.insert(accounts).values(row).run();
  return toView(row);
}

export function deleteAccount(db: Db, id: string): void {
  getAccountRow(db, id);
  db.delete(accounts).where(eq(accounts.id, id)).run();
}
