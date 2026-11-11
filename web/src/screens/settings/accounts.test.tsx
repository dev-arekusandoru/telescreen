import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAt, stubApi } from "@/test/api";

const ACCOUNTS = [
  { id: "acc_i", provider: "icloud", label: "Home iCloud", status: "ok", lastError: null },
  { id: "acc_g", provider: "google", label: "alex@example.com", status: "error", lastError: "Family: HTTP 503" },
];
const CALENDARS = [
  { id: "cal_1", accountId: "acc_i", name: "Home", color: "#aa0000", writable: true, enabled: true, memberId: null, lastSyncedAt: new Date().toISOString(), lastError: null },
  { id: "cal_2", accountId: "acc_i", name: "Holidays", color: null, writable: false, enabled: false, memberId: "mem_a", lastSyncedAt: null, lastError: null },
  { id: "cal_3", accountId: "acc_g", name: "Family", color: "#00aa00", writable: true, enabled: true, memberId: "mem_b", lastSyncedAt: null, lastError: "HTTP 503" },
];

let calls: Array<{ method: string; path: string; body: unknown }>;

beforeEach(() => {
  localStorage.clear();
  stubApi();
  const base = globalThis.fetch;
  calls = [];
  const json = (data: unknown, status = 200) =>
    new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: Request | string, init?: RequestInit) => {
      const req = typeof input === "string" ? new Request(input, init) : input;
      const path = new URL(req.url).pathname.replace("/api/v1", "");
      const body = req.method === "GET" ? undefined : await req.clone().json().catch(() => undefined);
      if (path === "/accounts" && req.method === "GET") return json(ACCOUNTS);
      if (path === "/calendars" && req.method === "GET") return json(CALENDARS);
      if (path === "/sync/status") return json({ lastSyncedAt: null, hasErrors: true });
      if (path === "/accounts/icloud") {
        calls.push({ method: req.method, path, body });
        const b = body as { appPassword: string };
        return b.appPassword === "bad" ? json({ error: { code: "unprocessable", message: "Apple ID or app-specific password was rejected" } }, 422) : json({ ...ACCOUNTS[0], id: "acc_new" }, 201);
      }
      if (path.startsWith("/accounts/") || path.startsWith("/calendars/")) {
        calls.push({ method: req.method, path, body });
        return path.endsWith("/sync") ? json({ lastSyncedAt: null, hasErrors: false }) : req.method === "DELETE" ? json(null, 204) : json(CALENDARS[0]);
      }
      if (path === "/accounts/google/start") return json({ authUrl: "https://accounts.google.com/x" });
      return base(input, init);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

/** Settings opens on a tile launcher; tap the tile to reach a section. */
async function openSection(name: string) {
  renderAt("/settings");
  await userEvent.click(await screen.findByRole("button", { name: new RegExp(`^${name}`) }));
}
describe("Settings: accounts and calendars", () => {
  it("lists accounts with status badges and last errors", async () => {
    await openSection("Accounts");
    const accounts = await screen.findByRole("region", { name: "Accounts" });
    expect(await within(accounts).findByText("Home iCloud")).toBeInTheDocument();
    expect(within(accounts).getByText("Connected")).toBeInTheDocument();
    expect(within(accounts).getByText("Sync problem")).toBeInTheDocument();
    expect(within(accounts).getByText("Family: HTTP 503")).toBeInTheDocument();
    expect(within(accounts).getByText(/iCloud · 2 calendars/)).toBeInTheDocument();
    expect(within(accounts).getByRole("button", { name: "Add Google" })).toBeInTheDocument();
  });

  it("syncs and removes an account", async () => {
    await openSection("Accounts");
    await userEvent.click(await screen.findByRole("button", { name: "Sync Home iCloud now" }));
    await waitFor(() => expect(calls).toContainEqual({ method: "POST", path: "/accounts/acc_i/sync", body: undefined }));

    await userEvent.click(screen.getByRole("button", { name: "Remove Home iCloud" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Nothing is deleted from iCloud/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.path === "/accounts/acc_i")).toBe(true));
  });

  it("adds an iCloud account and surfaces a rejected password", async () => {
    await openSection("Accounts");
    await userEvent.click(await screen.findByRole("button", { name: "Add iCloud" }));
    const dialog = await screen.findByRole("dialog", { name: "Add iCloud" });
    await userEvent.type(within(dialog).getByLabelText("Apple ID"), "apple@example.com");
    const submit = within(dialog).getByRole("button", { name: "Connect" });
    expect(submit).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("App-specific password"), "bad");
    await userEvent.click(submit);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("rejected");

    await userEvent.clear(within(dialog).getByLabelText("App-specific password"));
    await userEvent.type(within(dialog).getByLabelText("App-specific password"), "good");
    await userEvent.click(within(dialog).getByRole("button", { name: "Connect" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    const posts = calls.filter((c) => c.path === "/accounts/icloud");
    expect(posts.at(-1)?.body).toEqual({ label: "iCloud", appleId: "apple@example.com", appPassword: "good" });
  });

  it("shows calendars per account with writable/read-only and toggles visibility", async () => {
    await openSection("Calendars");
    const section = await screen.findByRole("region", { name: "Calendars" });
    const icloud = await within(section).findByRole("group", { name: "Home iCloud" });
    expect(within(icloud).getByText("Home")).toBeInTheDocument();
    expect(within(icloud).getByText("Read-only")).toBeInTheDocument();
    expect(within(icloud).getByText(/Can create events/)).toBeInTheDocument();
    const google = within(section).getByRole("group", { name: "alex@example.com" });
    expect(within(google).getByText("HTTP 503")).toBeInTheDocument();

    expect(within(icloud).getByRole("switch", { name: "Show Holidays" })).not.toBeChecked();
    await userEvent.click(within(icloud).getByRole("switch", { name: "Show Holidays" }));
    await waitFor(() => expect(calls).toContainEqual({ method: "PATCH", path: "/calendars/cal_2", body: { enabled: true } }));
    // Person mapping shows the current member.
    expect(within(icloud).getByRole("combobox", { name: "Person for Home" })).toHaveTextContent("Family / Both");
    expect(within(icloud).getByRole("combobox", { name: "Person for Holidays" })).toHaveTextContent("Alex");
  });

  it("offers per-member default write calendars (writable + enabled only)", async () => {
    await openSection("Calendars");
    expect(await screen.findByRole("combobox", { name: "Default calendar for Alex" })).toHaveTextContent("Ask each time");
    expect(screen.getByRole("combobox", { name: "Default calendar for Vale" })).toBeInTheDocument();
  });
});
