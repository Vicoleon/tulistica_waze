/**
 * MegaSuper / Instaleap diagnostic.
 * Run with: MS_DIAGNOSE=1 pnpm scrape megasuper --limit 1
 *
 * MegaSuper (megasuper.com) is a Next.js storefront on top of Instaleap
 * (clientId=MEGASUPER, storeReference=M102). The Instaleap GraphQL endpoint
 * at api.instaleap.io returns 403 without the proper auth headers — this
 * diagnostic browses a category page in real Chromium and captures every
 * request to api.instaleap.io / api.instaleap.com so we can reverse the
 * required headers/body.
 *
 * Output: /tmp/ms-diagnostic.json with full API call dump + screenshot.
 */

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const ORIGIN = "https://www.megasuper.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface ApiCall {
  url: string;
  method: string;
  requestHeaders: Record<string, string>;
  requestBody: string;
  status: number;
  responseHeaders: Record<string, string>;
  responseSample: string;
}

export async function runMegaSuperDiagnostic(): Promise<void> {
  console.log("[ms-diag] starting");

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
  });
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: "es-CR",
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      "sec-ch-ua": '"Chromium";v="148", "Not.A/Brand";v="24", "Google Chrome";v="148"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
    },
  });
  await ctx.addInitScript(() => {
    // __name polyfill for esbuild keepNames inside page.evaluate.
    const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };
    if (typeof g.__name !== "function") g.__name = (fn) => fn;

    Object.defineProperty(navigator, "webdriver", { get: () => undefined, configurable: true });
    const w = window as unknown as { chrome?: { runtime?: Record<string, unknown> } };
    if (!w.chrome) w.chrome = {};
    if (!w.chrome.runtime) w.chrome.runtime = {};
    Object.defineProperty(navigator, "plugins", {
      get: () => [1, 2, 3].map((i) => ({ name: `Plugin ${i}` })),
    });
    Object.defineProperty(navigator, "languages", { get: () => ["es-CR", "es", "en-US", "en"] });
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);

  const apiCalls: ApiCall[] = [];
  page.on("response", async (res) => {
    const url = res.url();
    // Focus on Instaleap and any GraphQL/REST API hits.
    if (!/instaleap|\/api\/|graphql/i.test(url)) return;
    // Skip static assets even in API domains.
    if (/\.(?:js|css|png|jpg|jpeg|webp|svg|woff2?|ico)(\?|$)/i.test(url)) return;
    try {
      const req = res.request();
      const reqHeaders = req.headers();
      const reqBody = req.postData() ?? "";
      const sample = await res.text().catch(() => "");
      apiCalls.push({
        url,
        method: req.method(),
        requestHeaders: reqHeaders,
        requestBody: reqBody.slice(0, 3000),
        status: res.status(),
        responseHeaders: res.headers(),
        responseSample: sample.slice(0, 4000),
      });
    } catch {
      // ignore
    }
  });

  // Visit home, then walk into a category.
  console.log(`[ms-diag] loading ${ORIGIN}`);
  try {
    await page.goto(ORIGIN, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(8_000);
  } catch (err) {
    console.log(`[ms-diag] home load failed: ${err instanceof Error ? err.message : err}`);
  }
  await page.screenshot({ path: "/tmp/ms-home.png", fullPage: false }).catch(() => {});

  // Categories are not `<a>` tags — they're clickable divs (Next.js router
  // push). Use Playwright's text matcher and click them.
  const categoryLabels = ["Abarrotes", "Carnes y Pescados", "Frutas y Verduras", "Bebidas"];
  let clickedLabel: string | null = null;
  for (const label of categoryLabels) {
    try {
      const tile = page.getByText(label, { exact: false }).first();
      if (await tile.isVisible({ timeout: 1500 }).catch(() => false)) {
        console.log(`[ms-diag] clicking category tile: ${label}`);
        await tile.click({ timeout: 5_000 });
        await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(4_000);
        const u = page.url();
        console.log(`[ms-diag] after click, url = ${u}`);
        if (u !== ORIGIN && u !== `${ORIGIN}/`) {
          clickedLabel = label;
          // Scroll for lazy-loaded products.
          for (let i = 0; i < 4; i++) {
            await page.evaluate(() => window.scrollBy(0, 2000));
            await page.waitForTimeout(1500);
          }
          break;
        }
      }
    } catch (err) {
      console.log(`[ms-diag] click ${label} failed: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (!clickedLabel) console.log("[ms-diag] could not navigate into any category tile");

  await page.screenshot({ path: "/tmp/ms-category.png", fullPage: false }).catch(() => {});

  // Capture body stats so we can spot price selectors later.
  const pageStats = await page.evaluate(() => {
    const text = (document.body.textContent ?? "").slice(0, 0);
    const priceCount = (document.body.textContent ?? "").match(/₡\s*[\d.,]+/g)?.length ?? 0;
    const headings = Array.from(document.querySelectorAll("h1,h2,h3")).slice(0, 5).map((h) => (h.textContent ?? "").trim().slice(0, 80));
    // Look for product card class hints.
    const counts = new Map<string, number>();
    document.querySelectorAll("[class]").forEach((el) => {
      el.className.toString().split(/\s+/).forEach((c) => {
        if (!c) return;
        counts.set(c, (counts.get(c) ?? 0) + 1);
      });
    });
    const productClasses = Array.from(counts.entries())
      .filter(([c, n]) => n >= 4 && /product|card|item|tile|sku/i.test(c))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    return { textPreviewLen: text.length, priceCount, headings, productClasses, url: location.href };
  });
  console.log("[ms-diag] page stats:", JSON.stringify(pageStats));

  writeFileSync(
    "/tmp/ms-diagnostic.json",
    JSON.stringify({ pageStats, apiCalls: apiCalls.slice(0, 40) }, null, 2)
  );
  console.log(`[ms-diag] ${apiCalls.length} API calls captured`);
  console.log("[ms-diag] full report: /tmp/ms-diagnostic.json");
  console.log("[ms-diag] screenshots: /tmp/ms-home.png /tmp/ms-category.png");

  await ctx.close();
  await browser.close();
}
