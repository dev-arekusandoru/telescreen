import { expect, test, type Page } from "@playwright/test";

const SCREENS = [
  { path: "/calendar", heading: /./ },
  { path: "/chores", heading: /Chores/i },
  { path: "/settings", heading: /Settings/i },
];

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const offenders: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > doc.clientWidth + 1 && getComputedStyle(el).position !== "fixed") {
        // Ignore content inside intentionally scrollable regions.
        let p = el.parentElement;
        let scrollable = false;
        while (p && p !== document.body) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === "auto" || ox === "scroll" || ox === "hidden") scrollable = true;
          p = p.parentElement;
        }
        if (!scrollable) offenders.push(`${el.tagName.toLowerCase()}.${el.className}`);
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, offenders: offenders.slice(0, 5) };
  });
  expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.clientWidth);
  expect(overflow.offenders, "elements overflowing the viewport").toEqual([]);
}

test("/ redirects to the calendar", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/calendar$/);
});

test("navigates between tabs", async ({ page }) => {
  await page.goto("/calendar");
  // The rail (>= 600px) and tab bar (< 600px) both exist in the DOM; only one is visible.
  const nav = page.getByRole("navigation", { name: "Primary" }).filter({ visible: true });
  await expect(nav).toHaveCount(1);
  await nav.getByRole("link", { name: "Chores" }).click();
  await expect(page).toHaveURL(/\/chores$/);
  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
});

test("theme override applies and persists across reload", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("radio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(lightBg).not.toBe(darkBg);
});

test("calendar keeps the selected view after idle, navigation and reload", async ({ page }) => {
  await page.clock.install();
  await page.goto("/calendar");
  const month = page.getByRole("radio", { name: "Month", exact: true });
  await month.click();
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByRole("button", { name: "Today", exact: true })).toBeVisible();

  await page.clock.fastForward(2 * 60_000 + 1);
  await expect(page.getByRole("button", { name: "Today", exact: true })).toHaveCount(0);
  await expect(month).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();

  const nav = page.getByRole("navigation", { name: "Primary" }).filter({ visible: true });
  await nav.getByRole("link", { name: "Chores" }).click();
  await nav.getByRole("link", { name: "Calendar" }).click();
  await expect(month).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(month).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".fc-dayGridMonth-view")).toBeVisible();
});

test("settings: household name and members can be edited", async ({ page }) => {
  await page.goto("/settings");
  const name = page.getByRole("textbox", { name: "Household name" });
  await name.fill("Casa Test");
  await name.press("Enter");
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Household name" })).toHaveValue("Casa Test");

  await page.getByRole("radiogroup", { name: "Color for Mara" }).getByRole("radio", { name: "plum" }).click();
  await expect(page.getByRole("radiogroup", { name: "Color for Mara" }).getByRole("radio", { name: "plum" })).toHaveAttribute("aria-checked", "true");
});

test("manifest and icons are served", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.display).toBe("standalone");
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  expect((await request.get("/sw.js")).ok()).toBe(true);
});

for (const { path, heading } of SCREENS) {
  test(`no horizontal overflow on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).filter({ hasText: heading }).first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectNoHorizontalOverflow(page);
  });
}
