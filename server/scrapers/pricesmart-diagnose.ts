/**
 * PriceSmart DOM/API diagnostic.
 * Run with: PS_DIAGNOSE=1 pnpm scrape pricesmart --limit 1
 *
 * Loads a sample product + category page and captures network calls,
 * DOM patterns, and screenshots.
 */

import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const ORIGIN = "https://www.pricesmart.com";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface ApiCall {
  url: string;
  method: string;
  body: string;
  status: number;
  sample: string;
}

export async function runPriceSmartDiagnostic(): Promise<void> {
  console.log("[ps-diag] starting");

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
    // Filter to anything that smells like a real API.
    if (/imagekit|gstatic|fonts|googletagmanager|google-analytics|doubleclick|\.css|\.svg|\.png|\.jpg|\.webp|\.woff/i.test(url)) return;
    if (!/api|graphql|bloomreach|product|price|catalog|search|inventory|item/i.test(url)) return;
    try {
      const req = res.request();
      const body = req.postData() ?? "";
      const text = await res.text().catch(() => "");
      apiCalls.push({
        url,
        method: req.method(),
        body: body.slice(0, 1500),
        status: res.status(),
        sample: text.slice(0, 2500),
      });
    } catch {
      // ignore
    }
  });

  // Load a known CR product (Imperial Light Beer 18-pack).
  const productUrl = `${ORIGIN}/es-cr/producto/imperial-light-cerveza-18-uds-350-ml-12-oz-331138/331138`;
  console.log(`[ps-diag] loading ${productUrl}`);
  try {
    await page.goto(productUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(10_000);
    // Wait for the price element to render
    await page.waitForSelector("text=/₡|\\$/", { timeout: 8000 }).catch(() => {});
  } catch (err) {
    console.log(`[ps-diag] product load failed: ${err instanceof Error ? err.message : err}`);
  }
  await page.screenshot({ path: "/tmp/ps-product.png", fullPage: false }).catch(() => {});

  // Capture stats + isolate the PRIMARY price element (near "Agregar a carrito").
  const productStats = await page.evaluate(() => {
    const text = document.body.textContent ?? "";
    const priceMatches = text.match(/₡\s*[\d.,]+/g) ?? [];
    const h1Text = (document.querySelector("h1")?.textContent ?? "").trim().slice(0, 200);

    // Find element with the price near the "Agregar" button.
    const agregarBtn = Array.from(document.querySelectorAll("button, a")).find((el) =>
      /agregar/i.test(el.textContent ?? "")
    );
    let nearestPrice = "";
    let priceSelectorHints: string[] = [];
    if (agregarBtn) {
      let current: Element | null = agregarBtn;
      // Walk up until we find an ancestor that contains a ₡ price.
      while (current && current !== document.body) {
        const parentText = current.textContent ?? "";
        const m = parentText.match(/₡\s*[\d.,]+/);
        if (m && parentText.length < 800) {
          // Found the smallest enclosing block with a price + CTA.
          nearestPrice = m[0];
          // Find the actual element containing JUST the price (no CTA text).
          const all = Array.from(current.querySelectorAll("*")) as HTMLElement[];
          for (const el of all) {
            const t = el.textContent ?? "";
            if (/₡\s*[\d.,]+/.test(t) && !/agregar/i.test(t) && t.length < 60) {
              priceSelectorHints.push(`<${el.tagName.toLowerCase()} class="${el.className}">`);
              if (priceSelectorHints.length >= 3) break;
            }
          }
          break;
        }
        current = current.parentElement;
      }
    }

    return {
      bodyLength: text.length,
      priceCount: priceMatches.length,
      firstPrices: priceMatches.slice(0, 8),
      h1: h1Text,
      nearestPriceToAgregar: nearestPrice,
      priceSelectorHints,
    };
  });
  console.log("[ps-diag] product page stats:", JSON.stringify(productStats));

  // Dump the full HTML + textContent of the price element for analysis.
  const priceElDump = await page.evaluate(() => {
    const el = document.querySelector(".product-price-dynamic, .prices-container, .sf-price");
    if (!el) return null;
    return {
      tag: el.tagName,
      className: el.className,
      outerHTML: el.outerHTML.slice(0, 1500),
      innerText: (el as HTMLElement).innerText ?? "",
      textContent: el.textContent ?? "",
    };
  });
  if (priceElDump) {
    console.log("[ps-diag] price element:");
    console.log("  textContent:", JSON.stringify(priceElDump.textContent));
    console.log("  innerText:  ", JSON.stringify(priceElDump.innerText));
    console.log("  outerHTML (first 600 chars):", priceElDump.outerHTML.slice(0, 600));
    writeFileSync("/tmp/ps-price-element.html", priceElDump.outerHTML);
  }

  // Load a category/aisle page.
  const aisleUrl = `${ORIGIN}/es-cr/pasillo-de-alimentos/granos`;
  console.log(`[ps-diag] loading aisle ${aisleUrl}`);
  try {
    await page.goto(aisleUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForTimeout(10_000);
    for (let i = 0; i < 4; i++) {
      await page.evaluate(() => window.scrollBy(0, 1500));
      await page.waitForTimeout(1500);
    }
  } catch (err) {
    console.log(`[ps-diag] aisle load failed: ${err instanceof Error ? err.message : err}`);
  }
  await page.screenshot({ path: "/tmp/ps-aisle.png", fullPage: false }).catch(() => {});

  const aisleStats = await page.evaluate(() => {
    const text = document.body.textContent ?? "";
    const priceMatches = text.match(/[₡$]\s*[\d.,]+/g) ?? [];
    // Find candidate product-card classes.
    const counts = new Map<string, number>();
    document.querySelectorAll("[class]").forEach((el) => {
      el.className.toString().split(/\s+/).forEach((c) => {
        if (!c) return;
        counts.set(c, (counts.get(c) ?? 0) + 1);
      });
    });
    const productClasses = Array.from(counts.entries())
      .filter(([c, n]) => n >= 4 && /product|card|item|tile/i.test(c))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);
    // Sample HTML of first element matching the top class.
    let sampleHtml = "";
    if (productClasses.length > 0) {
      const top = productClasses[0][0];
      const el = document.getElementsByClassName(top)[0];
      if (el) sampleHtml = el.outerHTML.slice(0, 3000);
    }
    return {
      bodyLength: text.length,
      priceCount: priceMatches.length,
      firstPrices: priceMatches.slice(0, 10),
      productClasses,
      sampleHtml,
    };
  });
  console.log("[ps-diag] aisle page stats:", JSON.stringify({ ...aisleStats, sampleHtml: aisleStats.sampleHtml.slice(0, 120) + "..." }));

  if (aisleStats.sampleHtml) {
    writeFileSync("/tmp/ps-card-sample.html", aisleStats.sampleHtml);
    console.log("[ps-diag] sample card HTML: /tmp/ps-card-sample.html");
  }

  writeFileSync(
    "/tmp/ps-diagnostic.json",
    JSON.stringify({ productStats, aisleStats, apiCalls: apiCalls.slice(0, 30) }, null, 2)
  );
  console.log(`[ps-diag] ${apiCalls.length} API calls captured`);
  console.log("[ps-diag] full report: /tmp/ps-diagnostic.json");

  await ctx.close();
  await browser.close();
}
