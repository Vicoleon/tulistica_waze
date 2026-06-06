import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Tulistica core-loop E2E tests.
 *
 * Requires the Playwright browsers and a running dev server:
 *   pnpm exec playwright install
 *   pnpm dev               # serves the app on http://localhost:3001
 *   pnpm exec playwright test
 *
 * These tests are intentionally NOT run by `pnpm test` (Vitest), whose
 * `include` is scoped to `server/**` only — see vitest.config.ts.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  // Optional: let Playwright boot the dev server. Disabled by default so CI
  // without a DB / env doesn't hang; enable by setting PW_WEB_SERVER=1.
  webServer: process.env.PW_WEB_SERVER
    ? {
        command: "pnpm dev",
        url: "http://localhost:3001",
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      }
    : undefined,
});
