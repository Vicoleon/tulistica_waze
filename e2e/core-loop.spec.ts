/**
 * Tulistica core-loop E2E (P14, Wave 6).
 *
 * SETUP (these tests are NOT part of `pnpm test` / Vitest):
 *   pnpm exec playwright install        # one-time: download browsers
 *   MOCK_AUTH=1 pnpm dev                # dev server on http://localhost:3001
 *   pnpm exec playwright test           # run this spec
 *
 * The spec walks the full crowdsourced loop:
 *   sign-in (MOCK_AUTH) -> /dashboard -> create list -> add item
 *   -> /optimize -> shopping mode -> report price -> leaderboard.
 *
 * Many steps are marked test.fixme until the corresponding selectors /
 * data-testids are confirmed in the live UI. The skeleton is real Playwright
 * API and valid TypeScript; fill in the selectors to activate each step.
 */
import { test, expect } from "@playwright/test";

const LIST_NAME = "E2E Compra Semanal";
const SAMPLE_PRODUCT = "Arroz";

test.describe("Tulistica core loop", () => {
  test.beforeEach(async ({ page }) => {
    // With MOCK_AUTH the app should bypass real OAuth and seed a test session.
    await page.goto("/");
  });

  test("signs in and lands on the dashboard", async ({ page }) => {
    // TODO(selectors): replace with the real sign-in entrypoint once confirmed.
    // Example shape:
    //   await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    // The dashboard should render at least one heading.
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test.fixme("creates a list and adds an item", async ({ page }) => {
    await page.goto("/dashboard");
    // await page.getByRole("button", { name: /nueva lista|crear lista/i }).click();
    // await page.getByLabel(/nombre/i).fill(LIST_NAME);
    // await page.getByRole("button", { name: /guardar|crear/i }).click();
    // await expect(page.getByText(LIST_NAME)).toBeVisible();

    // Add an item to the freshly created list.
    // await page.getByPlaceholder(/buscar producto/i).fill(SAMPLE_PRODUCT);
    // await page.getByRole("option", { name: new RegExp(SAMPLE_PRODUCT, "i") }).first().click();
    // await expect(page.getByText(SAMPLE_PRODUCT)).toBeVisible();
    expect(LIST_NAME).toBeTruthy();
    expect(SAMPLE_PRODUCT).toBeTruthy();
  });

  test.fixme("optimizes the cart", async ({ page }) => {
    await page.goto("/optimize");
    // await page.getByRole("button", { name: /optimizar/i }).click();
    // A result card (SINGLE or SPLIT) should appear with a grand total.
    // await expect(page.getByTestId("optimization-result").first()).toBeVisible();
  });

  test.fixme("enters shopping mode and reports a price", async ({ page }) => {
    await page.goto("/optimize");
    // await page.getByRole("button", { name: /modo compra|ir a comprar/i }).click();
    // await page.getByRole("button", { name: /reportar precio/i }).first().click();
    // await page.getByLabel(/precio/i).fill("750");
    // await page.getByRole("button", { name: /confirmar|enviar/i }).click();
    // await expect(page.getByText(/precio reportado|gracias/i)).toBeVisible();
  });

  test.fixme("shows the user on the leaderboard", async ({ page }) => {
    await page.goto("/leaderboard");
    // await expect(page.getByRole("heading", { name: /clasificación|leaderboard/i })).toBeVisible();
    // The signed-in test user should appear in the ranking.
    // await expect(page.getByTestId("leaderboard-row").first()).toBeVisible();
  });
});
