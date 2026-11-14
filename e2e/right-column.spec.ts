import { expect, test, type Page } from "@playwright/test";

/*
 * SPEC §8 right column (>= 1280px). Weather normally needs a live Open-Meteo call
 * and Meals/Music need external servers, so all three responses are stubbed in the
 * browser while the module flags are toggled through the real settings API.
 */

function weatherFixture() {
  const days = Array.from({ length: 5 }, (_, i) => ({
    date: new Date(Date.UTC(2026, 10, 4 + i)).toISOString().slice(0, 10),
    code: 1,
    label: "Mainly clear",
    group: "mainly_clear",
    high: 21 - i,
    low: 12 - i,
    precipProbability: 10,
  }));
  const hours = Array.from({ length: 24 }, (_, i) => ({
    time: `2026-11-04T${String(i).padStart(2, "0")}:00`,
    code: 1,
    label: "Mainly clear",
    group: "mainly_clear",
    temperature: 18 - i * 0.2,
    isDay: i >= 7 && i < 19,
    precipProbability: 10,
  }));
  return {
    latitude: 52.52,
    longitude: 13.405,
    timezone: "Europe/Berlin",
    units: "celsius",
    place: "Berlin",
    current: { temperature: 18, code: 1, label: "Mainly clear", group: "mainly_clear", isDay: true },
    today: days[0],
    days,
    hours,
    fetchedAt: new Date(Date.UTC(2026, 10, 4, 8)).toISOString(),
    stale: false,
  };
}

const MEALS = {
  weekStart: "2026-11-02",
  week: [
    {
      date: "2026-11-04",
      meals: [{ slot: "dinner", title: "Pasta al limone", recipeId: "r1", url: null }],
    },
  ],
  tonight: { slot: "dinner", title: "Pasta al limone", recipeId: "r1", url: null },
  fetchedAt: new Date(Date.UTC(2026, 10, 4, 8)).toISOString(),
  stale: false,
};

const CONNECTION = { connected: true, configured: true, label: "Alex", status: "ok", lastError: null };
const NOW_PLAYING = {
  track: {
    id: "track-1",
    title: "Right Column",
    artists: ["Telescreen"],
    album: "Smoke Test",
    albumArtUrl: null,
    durationMs: 200_000,
    progressMs: 30_000,
    isPlaying: true,
  },
  device: { id: "device-1", name: "Kitchen", type: "Speaker", volumePercent: 40, isActive: true },
};
const DEVICES = { devices: [NOW_PLAYING.device] };

async function stubUpstreams(page: Page) {
  await page.route("**/api/v1/weather", (route) => route.fulfill({ json: weatherFixture() }));
  await page.route("**/api/v1/meals/current", (route) => route.fulfill({ json: MEALS }));
  await page.route("**/api/v1/music/connection", (route) => route.fulfill({ json: CONNECTION }));
  await page.route("**/api/v1/music/now-playing", (route) => route.fulfill({ json: NOW_PLAYING }));
  await page.route("**/api/v1/music/devices", (route) => route.fulfill({ json: DEVICES }));
}

async function setModules(page: Page, modules: Record<string, boolean>) {
  const res = await page.request.put("/api/v1/settings", { data: { modules } });
  expect(res.ok(), await res.text()).toBe(true);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth };
  });
  expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.clientWidth);
}

test.describe("right column", () => {
  test("orders Weather, Tonight, Now playing and stays hidden with every module off", async ({ page }) => {
    const original = await (await page.request.get("/api/v1/settings")).json();
    await stubUpstreams(page);
    try {
      await setModules(page, { weather: false, meals: false, music: false, travel: false });
      await page.goto("/calendar");
      await expect(page.getByRole("complementary", { name: "At a glance" })).toBeHidden();

      await setModules(page, { weather: true, meals: true, music: true, travel: false });
      await page.goto("/calendar");
      const side = page.getByRole("complementary", { name: "At a glance" });
      await expect(side).toBeVisible();

      const cards = side.locator(":scope > section");
      await expect(cards).toHaveCount(3);
      await expect(cards.nth(0)).toHaveAttribute("aria-label", "Weather");
      await expect(cards.nth(0)).toContainText("18°");
      await expect(cards.nth(1)).toContainText("Tonight");
      await expect(cards.nth(1)).toContainText("Pasta al limone");
      await expect(cards.nth(2)).toContainText("Now playing");
      await expect(cards.nth(2)).toContainText("Right Column");

      // 1280 is the breakpoint; 1440 and the phone width must not overflow either.
      for (const [width, height] of [
        [1280, 820],
        [1440, 900],
        [390, 844],
      ] as const) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(150);
        await expectNoHorizontalOverflow(page);
        if (width >= 1280) await expect(side).toBeVisible();
        else await expect(side).toBeHidden();
      }
    } finally {
      await setModules(page, original.modules);
    }
  });
});
