/**
 * MegaSuper scraper.
 *
 * MegaSuper (megasuper.com) is a Next.js storefront on top of Instaleap SaaS.
 * Category pages are server-rendered at `/ca/{slug}` where slug comes from
 * the Instaleap `GetCategoryTree` GraphQL operation. The product list is
 * NOT exposed as a client-side JSON call — instead we extract product cards
 * directly from the rendered DOM.
 *
 * Flow:
 *   1. Fetch full category tree from `nextgentheadless.instaleap.io/api/v3`
 *      (POST GraphQL, no auth required, just header
 *      `apollographql-client-name: e-commerce Moira Engine client MEGASUPER`)
 *   2. Walk the tree, collect leaf categories.
 *   3. For each leaf, Playwright-navigate to `/ca/{slug}`, scroll, extract
 *      product cards via stable CSS classes:
 *        .CardName__CardNameStyles-sc-147zxke-0   (name)
 *        .CardBasePrice__CardBasePriceStyles-sc-1dlx87w-0   (price)
 *        .CardImage__CardImageStyles-sc-9m4bi8-0 img   (image)
 *   4. EAN-13 SKU comes from the PDP href: `/p/{slug}-{13-digit-ean}`
 *   5. Persist with `barcode = ean` so cross-chain dedup works.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { ProductData, ScrapeOptions } from "./base";

const CHAIN_ID = "megasuper";
const CHAIN_NAME = "MegaSuper";
const ORIGIN = "https://www.megasuper.com";
const API_URL = "https://nextgentheadless.instaleap.io/api/v3";
const CLIENT_ID = "MEGASUPER";
const STORE_REFERENCE = "M102";
const APOLLO_CLIENT_NAME = "e-commerce Moira Engine client MEGASUPER";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const NAV_TIMEOUT = 30_000;
const PER_PAGE_TIMEOUT = 15_000;
const PARALLEL_PAGES = 2;

interface MsCategory {
  name: string;
  slug: string;
  reference: string;
  hasChildren: boolean;
  level: number;
  subCategories?: MsCategory[];
}

interface MsProduct {
  ean: string;
  name: string;
  price: number;
  imageUrl?: string;
  sourceUrl: string;
}

/**
 * Fetch the full category tree from Instaleap. No auth required.
 */
async function fetchCategoryTree(): Promise<MsCategory[]> {
  const body = [
    {
      operationName: "GetCategoryTree",
      variables: { getCategoryInput: { clientId: CLIENT_ID, storeReference: STORE_REFERENCE } },
      query: `query GetCategoryTree($getCategoryInput: GetCategoryInput!) {
        getCategory(getCategoryInput: $getCategoryInput) {
          name slug reference hasChildren level
          subCategories {
            name slug reference hasChildren level
            subCategories {
              name slug reference hasChildren level
              subCategories { name slug reference hasChildren level }
            }
          }
        }
      }`,
    },
  ];
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "*/*",
      "apollographql-client-name": APOLLO_CLIENT_NAME,
      referer: `${ORIGIN}/`,
      "user-agent": USER_AGENT,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`category tree fetch failed: ${res.status}`);
  const json = (await res.json()) as Array<{ data?: { getCategory?: MsCategory[] } }>;
  const cats = json[0]?.data?.getCategory;
  if (!cats) throw new Error("category tree response missing data");
  return cats;
}

/**
 * Flatten the category tree into the list of leaf categories. We could scrape
 * non-leaf categories too, but leaves give us non-overlapping product sets and
 * the smallest API surface per request.
 */
function collectLeafCategories(roots: MsCategory[]): MsCategory[] {
  const leaves: MsCategory[] = [];
  const walk = (c: MsCategory) => {
    if (!c.hasChildren || !c.subCategories || c.subCategories.length === 0) {
      leaves.push(c);
      return;
    }
    for (const sub of c.subCategories) walk(sub);
  };
  for (const r of roots) walk(r);
  return leaves;
}

/**
 * Parse a CR-formatted price string like "₡1.050" or "₡13 295,00" into a number.
 */
function parsePrice(raw: string | null | undefined): number | null {
  if (!raw) return null;
  let s = raw.replace(/[₡\s  ]/g, "");
  if (!s) return null;
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized = s;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, "").replace(",", ".");
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, "");
  }
  const n = parseFloat(normalized);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function extractEanFromHref(href: string): string | null {
  // /p/{slug}-{8-to-14-digit-ean}
  const m = href.match(/\/p\/[^/]+?-(\d{8,14})(?:\/?$|\?)/);
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
    // esbuild __name polyfill (see pricesmart.ts for context).
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
  return ctx;
}

/**
 * Scrape one category page. Returns all products visible after lazy-load
 * scrolling. Caller is responsible for dedup if categories overlap.
 */
async function scrapeCategoryPage(page: Page, slug: string): Promise<MsProduct[]> {
  const url = `${ORIGIN}/ca/${slug}`;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    // Wait for at least one product card.
    await page
      .waitForSelector(".card-product-vertical", { timeout: PER_PAGE_TIMEOUT })
      .catch(() => {});
    // Scroll a few times to trigger lazy load. Categories with >50 products
    // paginate via infinite scroll.
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => window.scrollBy(0, 2400));
      await page.waitForTimeout(900);
    }
  } catch {
    return [];
  }

  const products = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".card-product-vertical")) as HTMLElement[];
    const results: { ean: string; name: string; priceText: string; imageUrl?: string; href?: string }[] = [];
    for (const card of cards) {
      // Find the PDP link inside the card (we need it for the EAN).
      const anchor = card.querySelector("a[href*='/p/']") as HTMLAnchorElement | null;
      const href = anchor?.href || "";

      const nameEl = card.querySelector("[class*='CardName']");
      const priceEl = card.querySelector("[class*='CardBasePrice']");
      const imgEl = card.querySelector("[class*='CardImage'] img") as HTMLImageElement | null;

      const name = (nameEl?.textContent ?? "").trim().replace(/\s+/g, " ");
      const priceText = (priceEl?.textContent ?? "").trim();
      const imageUrl = imgEl?.src || undefined;

      // EAN from URL — pull out trailing digits before extraction so we keep
      // the raw href for parsing in the Node-side code (regex with capture
      // doesn't survive serialization cleanly otherwise).
      results.push({ ean: "", name, priceText, imageUrl, href });
    }
    return results;
  });

  const parsed: MsProduct[] = [];
  for (const p of products) {
    if (!p.name || !p.priceText || !p.href) continue;
    const ean = extractEanFromHref(p.href);
    if (!ean) continue;
    const price = parsePrice(p.priceText);
    if (!price) continue;
    parsed.push({
      ean,
      name: p.name,
      price,
      imageUrl: p.imageUrl,
      sourceUrl: p.href,
    });
  }
  return parsed;
}

export interface MegaSuperScrapeResult {
  fetched: number;
  upserted: number;
  failed: number;
  totalCategories: number;
  categoriesScraped: number;
}

export async function scrapeMegaSuper(
  options: ScrapeOptions,
  onProduct: (data: ProductData) => Promise<void>
): Promise<MegaSuperScrapeResult> {
  const result: MegaSuperScrapeResult = {
    fetched: 0,
    upserted: 0,
    failed: 0,
    totalCategories: 0,
    categoriesScraped: 0,
  };

  console.log(`[${CHAIN_ID}] fetching category tree…`);
  const tree = await fetchCategoryTree();
  const leaves = collectLeafCategories(tree);
  result.totalCategories = leaves.length;
  console.log(`[${CHAIN_ID}] ${leaves.length} leaf categories`);

  const limit = options.limit ?? 2000;
  const seenEans = new Set<string>();

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: ["--disable-blink-features=AutomationControlled", "--no-sandbox"],
    });
    context = await makeContext(browser);

    let categoryIdx = 0;
    const nextCategory = (): MsCategory | null => {
      if (categoryIdx >= leaves.length) return null;
      return leaves[categoryIdx++];
    };

    const shouldStop = () => result.upserted >= limit;

    const workerFn = async (workerId: number): Promise<void> => {
      const page = await context!.newPage();
      page.setDefaultTimeout(PER_PAGE_TIMEOUT);
      try {
        while (!shouldStop()) {
          const cat = nextCategory();
          if (!cat) break;
          const products = await scrapeCategoryPage(page, cat.slug);
          result.fetched += products.length;
          result.categoriesScraped++;
          let newInCategory = 0;
          for (const p of products) {
            if (shouldStop()) break;
            if (seenEans.has(p.ean)) continue;
            seenEans.add(p.ean);
            try {
              await onProduct({
                name: p.name,
                imageUrl: p.imageUrl,
                price: p.price,
                currency: "CRC",
                sourceUrl: p.sourceUrl,
                barcode: p.ean,
              });
              result.upserted++;
              newInCategory++;
            } catch (err) {
              result.failed++;
              console.warn(
                `[${CHAIN_ID}/w${workerId}] persist failed for ${p.ean}: ${err instanceof Error ? err.message : err}`
              );
            }
          }
          console.log(
            `[${CHAIN_ID}/w${workerId}] ${cat.slug}: ${products.length} cards, ${newInCategory} new (total upserted: ${result.upserted})`
          );
        }
      } finally {
        await page.close().catch(() => {});
      }
    };

    await Promise.all(
      Array.from({ length: PARALLEL_PAGES }, (_, i) => workerFn(i + 1))
    );
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  return result;
}

export const megasuperMeta = {
  chainId: CHAIN_ID,
  chainName: CHAIN_NAME,
  __parsePrice: parsePrice,
  __extractEanFromHref: extractEanFromHref,
};
