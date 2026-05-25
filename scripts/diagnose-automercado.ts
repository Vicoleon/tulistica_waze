/**
 * One-off diagnostic: render automercado.cr in headless Chromium and dump
 * the structure of the login form + the first category page so we can wire
 * the right selectors into the scraper.
 *
 * Run: pnpm tsx scripts/diagnose-automercado.ts
 */

import "dotenv/config";
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const ORIGIN = "https://automercado.cr";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale: "es-CR" });
  const page = await ctx.newPage();
  page.setDefaultTimeout(20_000);

  console.log("→ Loading /login ...");
  await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded" });
  // Give Angular time to hydrate the form.
  await page.waitForTimeout(5000);
  const loginHtml = await page.content();
  writeFileSync("/tmp/am-login.html", loginHtml);
  await page.screenshot({ path: "/tmp/am-login.png", fullPage: false });
  console.log(`  saved /tmp/am-login.html (${loginHtml.length} bytes) + screenshot`);

  // Inspect input fields visible on the page.
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("input")).map((el, i) => ({
      i,
      type: el.type,
      name: el.name,
      id: el.id,
      placeholder: el.placeholder,
      formControlName: el.getAttribute("formcontrolname"),
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    }));
  });
  console.log("\nInputs on /login:");
  console.table(inputs);

  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll("button")).map((el, i) => ({
      i,
      type: el.type,
      text: el.textContent?.trim().slice(0, 60),
      visible: !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length),
    }));
  });
  console.log("\nButtons on /login:");
  console.table(buttons.filter((b) => b.visible).slice(0, 20));

  // Now sniff the first category page to see what product cards look like.
  console.log("\n→ Loading category /categorias/abarrotes ...");
  await page.goto(`${ORIGIN}/categorias/abarrotes`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000); // wait for Angular to fetch products
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.scrollBy(0, 1500));
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: "/tmp/am-cat.png", fullPage: false });
  const catHtml = await page.content();
  writeFileSync("/tmp/am-cat.html", catHtml);
  console.log(`  saved /tmp/am-cat.html (${catHtml.length} bytes) + screenshot`);

  // Detect repeated class patterns that look like product cards.
  const classCounts = await page.evaluate(() => {
    const counts = new Map<string, number>();
    document.querySelectorAll("[class]").forEach((el) => {
      el.className.split(/\s+/).forEach((c) => {
        if (!c) return;
        counts.set(c, (counts.get(c) ?? 0) + 1);
      });
    });
    const arr = Array.from(counts.entries())
      .filter(([c, n]) => n >= 8 && /product|card|item|tile|grid/i.test(c))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20);
    return arr;
  });
  console.log("\nTop classes that look product-y on the category page:");
  console.table(classCounts.map(([cls, count]) => ({ cls, count })));

  // Also capture XHR endpoints called during category load.
  const apiCalls: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (/api|graphql|catalog|product|search/i.test(url) && !url.includes("imagekit") && !url.includes("svg")) {
      apiCalls.push(`${req.method()} ${url}`);
    }
  });
  console.log("\n→ Reloading category to capture API calls ...");
  await page.reload({ waitUntil: "networkidle", timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  console.log(`\nAPI calls observed (${apiCalls.length}):`);
  for (const call of apiCalls.slice(0, 25)) console.log("  ", call);

  await ctx.close();
  await browser.close();
}

main().catch((err) => {
  console.error("diagnose failed:", err);
  process.exit(1);
});
