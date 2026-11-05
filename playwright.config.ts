import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 4010);
const FAKE_PORT = PORT - 1;

/**
 * Smoke flows against the built app (`pnpm e2e` builds the web first).
 * The server runs with an empty, throwaway database that is recreated every run.
 */
export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    // Deterministic wall-clock-independent rendering.
    timezoneId: "Europe/Berlin",
    locale: "en-US",
    serviceWorkers: "block",
  },
  projects: [
    {
      name: "ipad-1180x820",
      testIgnore: /right-column/,
      use: { viewport: { width: 1180, height: 820 }, hasTouch: true },
    },
    {
      name: "phone-390x844",
      testIgnore: /right-column/,
      use: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
    },
    {
      name: "wall-1440x900",
      testMatch: /right-column/,
      use: { viewport: { width: 1440, height: 900 }, hasTouch: true },
    },
  ],
  webServer: [
    {
      command: "tsx e2e/fake-caldav-server.ts",
      url: `http://127.0.0.1:${FAKE_PORT}/__health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { FAKE_CALDAV_PORT: String(FAKE_PORT) },
    },
    {
      command: "rm -rf .e2e-data && tsx src/server.ts",
      url: `http://127.0.0.1:${PORT}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        PORT: String(PORT),
        HOST: "127.0.0.1",
        HOMEHUB_TRUST_NETWORK: "1",
        HOMEHUB_DATA_DIR: ".e2e-data",
        HOMEHUB_HOUSEHOLD_NAME: "Test Home",
        HOMEHUB_SECRET_KEY: "ab".repeat(32),
        ICLOUD_CALDAV_URL: `http://127.0.0.1:${FAKE_PORT}`,
        TZ: "Europe/Berlin",
      },
    },
  ],
});
