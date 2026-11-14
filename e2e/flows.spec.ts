import { expect, test, type APIRequestContext } from "@playwright/test";

/*
 * Core flows from SPEC §11. The server talks to `e2e/fake-caldav-server.ts` as its "iCloud",
 * so event creation exercises the full path: UI -> API -> CalDAV PUT -> cache -> refetch.
 */

async function ensureIcloudAccount(request: APIRequestContext) {
  const accounts = await (await request.get("/api/v1/accounts")).json();
  if (accounts.length > 0) return;
  const res = await request.post("/api/v1/accounts/icloud", {
    data: { label: "Fake iCloud", appleId: "apple@example.com", appPassword: "app-pass" },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

test("chores: tap a chore to complete it, progress updates, undo reverts", async ({ page }) => {
  // Start from a clean slate (the other viewport project shares this server).
  for (const chore of await (await page.request.get("/api/v1/chores")).json()) {
    await page.request.delete(`/api/v1/chores/${chore.id}`);
  }
  const members = await (await page.request.get("/api/v1/members")).json();
  const res = await page.request.post("/api/v1/chores", {
    data: {
      name: "Take out trash",
      icon: "🗑️",
      recurrence: { type: "daily" },
      assignment: "fixed",
      memberIds: [members[0].id],
    },
  });
  expect(res.ok(), await res.text()).toBe(true);

  await page.goto("/chores");
  const chore = page.getByRole("button", { name: "Take out trash" });
  const maraProgress = page.locator("em", { hasText: /^\d+\/\d+$/ }).first();
  await expect(chore).toHaveAttribute("aria-pressed", "false");
  await expect(maraProgress).toHaveText("0/1");

  await chore.click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark done for Mara" }).click();
  await expect(page.getByRole("button", { name: "Take out trash, done" })).toHaveAttribute("aria-pressed", "true");
  await expect(maraProgress).toHaveText("1/1");

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByRole("button", { name: "Take out trash" })).toHaveAttribute("aria-pressed", "false");
  await expect(maraProgress).toHaveText("0/1");
});

test("calendar: create an event from the + sheet", async ({ page }, testInfo) => {
  await ensureIcloudAccount(page.request);
  const title = `Dentist ${testInfo.project.name}`;

  await page.goto("/calendar");
  await page.getByRole("button", { name: "Add event" }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("textbox", { name: "Title" }).fill(title);
  // Pin a daytime slot on today: near midnight the "next hour" default spills into
  // tomorrow, and the phone opens in Day view, so the event would not be on screen.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  await sheet.getByLabel("Starts").fill(today);
  await sheet.getByLabel("Time").first().fill("09:00");
  await sheet.getByLabel("Ends").fill(today);
  await sheet.getByLabel("Time").nth(1).fill("10:00");
  await sheet.getByRole("button", { name: /^Add (to .* calendar|event)$/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByText(title).first()).toBeVisible();

  // Survives a reload, i.e. it was written to CalDAV and cached, not just optimistic.
  await page.reload();
  await expect(page.getByText(title).first()).toBeVisible();
});
