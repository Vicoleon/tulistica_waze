/**
 * PriceSmart scraper.
 *
 * Discovered via diagnostic:
 *   - Nuxt (Vue) SPA behind Cloudflare → need stealth Chromium
 *   - Public sitemap with ~4,200 CR product URLs at /es-cr/producto/{slug}-{id}/{id}
 *   - No login required to see prices (members-only is just for buying)
 *   - Product price selector: `.sf-price__regular` (text format `₡13 295,00`)
 *   - Product name: `<h1>`
 *
 * Strategy:
 *   1. Collect all es-cr product URLs from sitemap-index → sitemapN
 *   2. Pool of N concurrent Playwright pages, each scrapes one product
 *   3. Persist via shared layer
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { ProductData, ScrapeOptions } from "./base";

const CHAIN_ID = "pricesmart";
const CHAIN_NAME = "PriceSmart";
const ORIGIN = "https://www.pricesmart.com";
const SITEMAP_INDEX = `${ORIGIN}/sitemap-index.xml`;

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const NAV_TIMEOUT = 35_000;
// Nuxt SPA + Cloudflare can take a while to hydrate the price on first paint.
const PER_PAGE_TIMEOUT = 25_000;
const PARALLEL_PAGES = 3;
// Delay between starting parallel batches so we don't hammer Cloudflare.
const BATCH_DELAY_MS = 800;
// How many diagnostic dumps to capture on early failures, to help debug.
const MAX_FAILURE_DUMPS = 3;

interface ProductExtraction {
  name: string;
  brand?: string;
  imageUrl?: string;
  price: number;
  sku: string;
  sourceUrl: string;
}

async function fetchProductUrls(): Promise<string[]> {
  // 1. Fetch the index, get sub-sitemaps
  const indexRes = await fetch(SITEMAP_INDEX, { headers: { "User-Agent": USER_AGENT } });
  if (!indexRes.ok) throw new Error(`sitemap index fetch failed: ${indexRes.status}`);
  const indexXml = await indexRes.text();
  const subSitemaps: string[] = [];
  const indexRe = /<loc>\s*([^<\s]+)\s*<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = indexRe.exec(indexXml)) !== null) {
    if (m[1].includes("/sitemap")) subSitemaps.push(m[1].trim());
  }

  // 2. For each sub-sitemap, extract es-cr product URLs.
  const productUrls: string[] = [];
  for (const sub of subSitemaps) {
    try {
      const r = await fetch(sub, { headers: { "User-Agent": USER_AGENT } });
      if (!r.ok) continue;
      const xml = await r.text();
      const locRe = /<loc>\s*(https:\/\/www\.pricesmart\.com\/es-cr\/producto\/[^<\s]+)\s*<\/loc>/g;
      let mp: RegExpExecArray | null;
      while ((mp = locRe.exec(xml)) !== null) {
        productUrls.push(mp[1].trim());
      }
    } catch {
      // skip failed sub-sitemap
    }
  }
  return productUrls;
}

/**
 * Parse a CR-formatted price string like "₡13 295,00" into a number.
 * Strips currency, normalizes spaces+dots as thousands separators and comma
 * as decimal separator.
 */
function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // Remove currency symbol, NBSP and normal spaces.
  let s = raw.replace(/[₡\s  ]/g, "");
  if (!s) return null;
  // CR uses "." or "," as thousands and "," as decimal. Heuristic: last "," is
  // the decimal point; everything before is thousands.
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized = s;
  if (lastComma > lastDot) {
    // "," is decimal — strip dots (thousands) then swap comma→dot.
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    // "." is decimal — strip commas (thousands).
    normalized = s.replace(/,/g, "");
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractSkuFromUrl(url: string): string | null {
  // /es-cr/producto/{slug}-{id}/{id} — trailing path segment is the SKU.
  const m = url.match(/\/(\d{4,})\/?$/);
  return m ? m[1] : null;
}

async function makeContext(browser: Browser): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    userAgent: USER_AGENT,
    locale: "es-CR",
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: {
      "sec-ch-ua": '"Chromium";v="148", "Not.A/Brand";v="24", "Google Chrome";v="148"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
    },
  });
  await ctx.addInitScript(() => {
    // esbuild (via tsx) injects a `__name` helper into page.evaluate callbacks
    // when keepNames is on; the browser doesn't define it, so every evaluate
    // throws ReferenceError. Polyfill as a no-op identity function.
    const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };
    if (typeof g.__name !== "function") g.__name = (fn) => fn;

    Object.defineProperty(navigator, "webdriver", { get: () => undefined, configurable: true });
    const w = window as unknown as { chrome?: { runtime?: Record<string, unknown> } };
    if (!w.chrome) w.chrome = {};
    if (!w.chrome.runtime) w.chrome.runtime = {};
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3].map((i) => ({ name: `Plugin ${i}` })) });
    Object.defineProperty(navigator, "languages", { get: () => ["es-CR", "es", "en-US", "en"] });
  });
  return ctx;
}

interface ScrapeFailure {
  reason:
    | "nav-timeout"
    | "no-h1"
    | "no-price"
    | "bad-price"
    | "out-of-stock"
    | "no-sku"
    | "exception"
    | "stale-404";
  message?: string;
  pageStatus?: number;
  bodyLen?: number;
  priceSnippet?: string;
}

type ScrapeAttempt =
  | { ok: true; data: ProductExtraction }
  | { ok: false; failure: ScrapeFailure };

/**
 * Scrape a single product page. Returns ok:false with a typed reason on
 * failure, so callers can log/debug instead of just counting silent nulls.
 */
async function scrapeProductPage(page: Page, url: string): Promise<ScrapeAttempt> {
  try {
    const response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    const status = response?.status() ?? 0;
    // Skip pages that have been removed (seasonal products no longer in catalog).
    if (status === 404) {
      return { ok: false, failure: { reason: "stale-404", pageStatus: status } };
    }
    // Wait for the price node to hydrate (Nuxt SPA).
    await page
      .waitForSelector(".sf-price__regular, .product-price-dynamic, [class*='sf-price']", {
        timeout: PER_PAGE_TIMEOUT,
      })
      .catch(() => {});

    const data = await page.evaluate(() => {
      const text = (sel: string): string | null => {
        const el = document.querySelector(sel);
        return el ? (el.textContent ?? "").trim() : null;
      };

      const h1El = document.querySelector("h1");
      const h1 = h1El ? (h1El.textContent ?? "").trim() : null;

      // Price: prefer the structured selectors; fall back to walking the H1's
      // ancestors and pulling the nearest `₡NNNNN` text node. Members-only or
      // alternate-layout products sometimes don't use `.sf-price__regular` but
      // always render the price somewhere near the title.
      let priceText: string | null =
        text(".sf-price__regular") ||
        text(".product-price-dynamic .sf-price") ||
        text(".sf-price") ||
        text("[class*='sf-price__regular']") ||
        text("[class*='price__regular']");

      if (!priceText && h1El) {
        let cur: Element | null = h1El.parentElement;
        for (let depth = 0; cur && depth < 8 && !priceText; depth++, cur = cur.parentElement) {
          const t = cur.textContent ?? "";
          if (t.length > 4000) break; // too broad — would hit footer prices etc.
          const m = t.match(/₡\s*[\d.,]{3,}/);
          if (m) priceText = m[0];
        }
      }

      // Brand: usually appears as a small heading or link near the name.
      const brand =
        text(".product__brand") ||
        text("[class*='brand']") ||
        text(".sf-product-card__brand");

      // Image: first product image (skip nav/logo).
      const imgEl = document.querySelector(
        ".product-images img, .sf-gallery img, picture img"
      ) as HTMLImageElement | null;
      const imageUrl = imgEl?.src || undefined;

      const bodyLen = (document.body.textContent ?? "").length;

      return { h1, priceText, brand, imageUrl, bodyLen };
    });

    if (!data.h1) {
      return { ok: false, failure: { reason: "no-h1", pageStatus: status, bodyLen: data.bodyLen } };
    }
    if (!data.priceText) {
      return { ok: false, failure: { reason: "no-price", pageStatus: status, bodyLen: data.bodyLen } };
    }
    const price = parsePriceFromPage(data.priceText);
    if (!price) {
      // Explicit out-of-stock: PriceSmart renders ₡0,00 for products not
      // currently available at the CR location.
      const isZero = /₡\s*0[.,]?0*\b/.test(data.priceText);
      return {
        ok: false,
        failure: {
          reason: isZero ? "out-of-stock" : "bad-price",
          priceSnippet: data.priceText.slice(0, 60),
          pageStatus: status,
        },
      };
    }
    const sku = extractSkuFromUrl(url);
    if (!sku) return { ok: false, failure: { reason: "no-sku", pageStatus: status } };

    return {
      ok: true,
      data: {
        name: data.h1.trim().replace(/\s+/g, " "),
        brand: data.brand?.trim() || undefined,
        imageUrl: data.imageUrl,
        price,
        sku,
        sourceUrl: url,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const reason: ScrapeFailure["reason"] = /timeout/i.test(message) ? "nav-timeout" : "exception";
    return { ok: false, failure: { reason, message } };
  }
}

// Wrapper exposed so unit tests / scripts can reuse the parser.
function parsePriceFromPage(text: string): number | null {
  return parsePrice(text);
}

interface WorkerOutcome {
  scraped: number;
  failed: number;
  failureCounts: Record<string, number>;
}

/**
 * Worker function — picks URLs off a queue and scrapes each.
 */
async function worker(
  workerId: number,
  ctx: BrowserContext,
  queue: { next(): string | null },
  onResult: (result: ProductExtraction) => Promise<void>,
  shouldStop: () => boolean,
  failureDumpBudget: { remaining: number }
): Promise<WorkerOutcome> {
  const page = await ctx.newPage();
  page.setDefaultTimeout(PER_PAGE_TIMEOUT);
  let scraped = 0;
  let failed = 0;
  const failureCounts: Record<string, number> = {};
  while (!shouldStop()) {
    const url = queue.next();
    if (!url) break;
    const attempt = await scrapeProductPage(page, url);
    if (attempt.ok) {
      try {
        await onResult(attempt.data);
        scraped++;
      } catch (err) {
        failed++;
        failureCounts.persist = (failureCounts.persist ?? 0) + 1;
        console.warn(
          `[${CHAIN_ID}/w${workerId}] persist failed for ${attempt.data.sku}: ${err instanceof Error ? err.message : err}`
        );
      }
    } else {
      failed++;
      const reason = attempt.failure.reason;
      failureCounts[reason] = (failureCounts[reason] ?? 0) + 1;
      if (failureDumpBudget.remaining > 0) {
        failureDumpBudget.remaining--;
        const f = attempt.failure;
        console.warn(
          `[${CHAIN_ID}/w${workerId}] FAIL ${reason} status=${f.pageStatus ?? "?"} bodyLen=${f.bodyLen ?? "?"} msg=${f.message ?? ""} priceSnippet=${f.priceSnippet ?? ""} url=${url}`
        );
      }
    }
  }
  await page.close().catch(() => {});
  return { scraped, failed, failureCounts };
}

export interface PriceSmartScrapeResult {
  fetched: number;
  upserted: number;
  /** Real failures (timeouts, parse errors, persist errors). */
  failed: number;
  /** Sitemap entries that 404 — seasonal / removed products. Informational. */
  stale404: number;
  /** Products with ₡0,00 — temporarily unavailable at the CR location. */
  outOfStock: number;
  totalProductUrls: number;
}

export async function scrapePriceSmart(
  options: ScrapeOptions,
  onProduct: (data: ProductData) => Promise<void>
): Promise<PriceSmartScrapeResult> {
  const result: PriceSmartScrapeResult = {
    fetched: 0,
    upserted: 0,
    failed: 0,
    stale404: 0,
    outOfStock: 0,
    totalProductUrls: 0,
  };

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  try {
    console.log(`[${CHAIN_ID}] discovering product URLs from sitemap…`);
    const urls = await fetchProductUrls();
    result.totalProductUrls = urls.length;
    const limit = options.limit ?? 1000;
    const queueUrls = urls.slice(0, limit);
    console.log(`[${CHAIN_ID}] sitemap had ${urls.length} CR products; scraping ${queueUrls.length}`);

    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
    context = await makeContext(browser);

    // Warm-up: visit the CR home before iterating products so Cloudflare /
    // Nuxt has cookies + cached chunks. Without this, every cold product page
    // hits the 25s hydrate timeout on its own.
    const warm = await context.newPage();
    try {
      await warm.goto(`${ORIGIN}/es-cr`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      await warm.waitForTimeout(4000);
      console.log(`[${CHAIN_ID}] warm-up complete`);
    } catch (err) {
      console.warn(`[${CHAIN_ID}] warm-up failed (continuing anyway): ${err instanceof Error ? err.message : err}`);
    } finally {
      await warm.close().catch(() => {});
    }

    let idx = 0;
    const queue = {
      next(): string | null {
        if (idx >= queueUrls.length) return null;
        return queueUrls[idx++];
      },
    };

    let progress = 0;
    const onResult = async (data: ProductExtraction): Promise<void> => {
      await onProduct({
        name: data.name,
        brand: data.brand,
        imageUrl: data.imageUrl,
        price: data.price,
        currency: "CRC",
        sourceUrl: data.sourceUrl,
        // Use the SKU from URL as a stable identifier. We persist it as the
        // "barcode" field since it's PriceSmart's internal item number, not a
        // true EAN — but it dedups correctly.
        barcode: `ps-${data.sku}`,
      });
      result.upserted++;
      progress++;
      if (progress % 25 === 0) {
        console.log(`[${CHAIN_ID}] progress: ${progress}/${queueUrls.length} upserted`);
      }
      // Polite throttle between persists.
      if (BATCH_DELAY_MS > 0) await new Promise((r) => setTimeout(r, 50));
    };

    const shouldStop = () => result.upserted >= limit;

    // Shared budget for verbose failure dumps so we don't flood logs.
    const failureDumpBudget = { remaining: MAX_FAILURE_DUMPS };

    // Launch N workers in parallel.
    const workers = Array.from({ length: PARALLEL_PAGES }, (_, i) =>
      worker(i + 1, context!, queue, onResult, shouldStop, failureDumpBudget)
    );
    const outcomes = await Promise.all(workers);
    const aggregateFailures: Record<string, number> = {};
    for (const o of outcomes) {
      result.fetched += o.scraped + o.failed;
      for (const [reason, count] of Object.entries(o.failureCounts)) {
        aggregateFailures[reason] = (aggregateFailures[reason] ?? 0) + count;
        if (reason === "stale-404") {
          result.stale404 += count;
        } else if (reason === "out-of-stock") {
          result.outOfStock += count;
        } else {
          result.failed += count;
        }
      }
    }
    if (Object.keys(aggregateFailures).length > 0) {
      console.log(`[${CHAIN_ID}] failure breakdown: ${JSON.stringify(aggregateFailures)}`);
    }
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  return result;
}

export const pricesmartMeta = {
  chainId: CHAIN_ID,
  chainName: CHAIN_NAME,
  // Exposed for testing the price parser
  __parsePrice: parsePrice,
};
