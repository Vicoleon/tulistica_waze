/**
 * Auto Mercado scraper.
 *
 * Auto Mercado runs an Angular SPA with most of its catalog behind login.
 * After diagnosis we know:
 *   - Login form uses `formcontrolname="email"` and `formcontrolname="password"`
 *   - After login, AM may show a "subscription cancelled" upsell modal that
 *     blocks navigation until clicking "Continuar Comprando"
 *   - Category pages (e.g. /categorias/abarrotes/aceites-y-grasas) render
 *     product cards with class `card-product`
 *   - The page lazy-loads on scroll; we scroll repeatedly to surface more cards
 *
 * Strategy:
 *   1. Login with vault creds, dismiss any modal
 *   2. For each category URL in the sitemap, navigate and scrape cards
 *   3. Upsert via the shared persist layer
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { drizzle } from "drizzle-orm/mysql2";
import { and, desc, eq } from "drizzle-orm";
import { integrationCredentials } from "../../drizzle/schema";
import { decryptCredential } from "../_core/vault";
import type { ProductData, ScrapeOptions } from "./base";

const CHAIN_ID = "automercado";
const CHAIN_NAME = "Auto Mercado";
const ORIGIN = "https://automercado.cr";

const NAV_TIMEOUT = 30_000;
// Several categories rendered 0 cards in the first end-to-end run; bump the
// wait/scroll counts so the Angular grid has time to populate.
const PAGE_LOAD_WAIT = 7000;
const LAZY_SCROLLS = 10;
const SCROLL_PAUSE = 1500;
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

interface AmCredentials {
  email: string;
  password: string;
}

async function loadCredentialsForUser(userId: number): Promise<{ id: number; cred: AmCredentials } | null> {
  if (!process.env.DATABASE_URL) return null;
  const db = drizzle(process.env.DATABASE_URL);
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.integration, CHAIN_ID)))
    .orderBy(desc(integrationCredentials.updatedAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return { id: row.id, cred: decryptCredential<AmCredentials>(row.ciphertext) };
}

async function findFirstCredential(): Promise<{ id: number; userId: number; cred: AmCredentials } | null> {
  if (!process.env.DATABASE_URL) return null;
  const db = drizzle(process.env.DATABASE_URL);
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(eq(integrationCredentials.integration, CHAIN_ID))
    .orderBy(desc(integrationCredentials.updatedAt))
    .limit(1);
  const row = rows[0];
  if (!row || !row.userId) return null;
  return { id: row.id, userId: row.userId, cred: decryptCredential<AmCredentials>(row.ciphertext) };
}

async function fetchCategoryUrls(): Promise<string[]> {
  const res = await fetch(`${ORIGIN}/sitemap.xml`, {
    headers: { "User-Agent": USER_AGENT, "Accept-Encoding": "gzip" },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const urls: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) urls.push(m[1]);
  // Only deep category URLs (have a sub-category segment).
  return urls.filter((url) => {
    if (!url.includes("/categorias/")) return false;
    const tail = url.split("/categorias/")[1] ?? "";
    return tail.split("/").filter(Boolean).length >= 2;
  });
}

async function dismissModals(page: Page): Promise<void> {
  // After login AM may show an upsell modal. After category navigation other
  // modals (cookies, store selection) may appear.
  const dismissSelectors = [
    'button:has-text("Continuar Comprando")',
    'button:has-text("Continuar comprando")',
    'button:has-text("Continuar")',
    'button:has-text("Aceptar")',
    'button:has-text("Entendido")',
    'button[aria-label*="close" i]',
    '[class*="modal"] button[class*="close"]',
  ];
  for (const sel of dismissSelectors) {
    await page.locator(sel).first().click({ timeout: 1500 }).catch(() => {});
  }
  await page.waitForTimeout(500);
}

async function tryLogin(page: Page, cred: AmCredentials): Promise<boolean> {
  try {
    await page.goto(`${ORIGIN}/login`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    await page.waitForSelector('input[formcontrolname="email"]', { timeout: 15_000 });
    await page.locator('input[formcontrolname="email"]').first().fill(cred.email);
    await page.locator('input[formcontrolname="password"]').first().fill(cred.password);
    // Don't await navigation on click — modal may appear without a URL change.
    await page
      .locator('button[type="submit"]')
      .first()
      .click({ timeout: 5000, noWaitAfter: true })
      .catch(async () => {
        await page.keyboard.press("Enter");
      });

    // Either URL changes OR an upsell modal appears — both mean login succeeded.
    await Promise.race([
      page.waitForURL((url) => !url.toString().includes("/login"), { timeout: 12_000 }),
      page.waitForSelector('button:has-text("Continuar Comprando"), button:has-text("Continuar comprando")', {
        timeout: 12_000,
      }),
    ]).catch(() => {});

    await dismissModals(page);
    return true;
  } catch (err) {
    console.warn(`[${CHAIN_ID}] login attempt threw: ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

type ExtractedProduct = Omit<ProductData, "currency" | "sourceUrl" | "barcode">;

/**
 * DOM extractor for Auto Mercado product cards.
 *
 * Real card structure (discovered via diagnostic):
 *   div.card.card-product[data-ts-product="<GUID>"]
 *     a.img-product[href="/p/<slug>/id/<GUID>"]
 *       img.img-fluid[alt="Product Name"]
 *     (price text "₡X,XXX" appears within card body)
 *
 * Each card has the product GUID in `data-ts-product` — we use it as a stable
 * identifier so re-scrapes dedup correctly.
 */
async function extractProducts(page: Page): Promise<Array<ExtractedProduct & { sku?: string; productUrl?: string }>> {
  return page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll(".card.card-product")) as HTMLElement[];
    const results: Array<{
      name: string;
      brand?: string;
      imageUrl?: string;
      price: number;
      sku?: string;
      productUrl?: string;
    }> = [];

    for (const card of cards) {
      // Skip sponsored/ad cards that show "Patrocinador" badge — those have
      // unstable identity and aren't real catalog entries.
      const cardText = card.textContent ?? "";
      if (/patrocinador/i.test(cardText)) continue;

      // Name: img alt is the cleanest source; fall back to anchor text.
      const img = card.querySelector("img") as HTMLImageElement | null;
      const link = card.querySelector("a.img-product, a[class*='product']") as HTMLAnchorElement | null;
      let name = img?.alt?.trim();
      if (!name) name = link?.textContent?.trim();
      if (!name) continue;

      // Price: first ₡ amount in card text. Cards with no price (out-of-stock or
      // gated by membership) are skipped — we only persist actionable data.
      const priceMatch = cardText.match(/₡\s*([\d.,]+)/);
      if (!priceMatch) continue;
      const priceNum = parseFloat(priceMatch[1].replace(/\./g, "").replace(",", "."));
      if (!priceNum || Number.isNaN(priceNum) || priceNum < 50) continue;

      const sku = card.getAttribute("data-ts-product") ?? undefined;
      const href = link?.getAttribute("href") ?? undefined;
      const productUrl = href ? new URL(href, window.location.origin).toString() : undefined;
      const imageUrl = img?.src || undefined;

      results.push({
        name: name.replace(/\s+/g, " ").trim(),
        imageUrl,
        price: priceNum,
        sku,
        productUrl,
      });
    }
    return results;
  });
}

export interface AutoMercadoScrapeResult {
  fetched: number;
  upserted: number;
  errors: number;
  loggedIn: boolean;
  credentialId: number | null;
  categoriesVisited: number;
}

export async function scrapeAutoMercado(
  options: ScrapeOptions,
  onProduct: (data: ProductData) => Promise<void>,
  loaderOverride?: () => Promise<{ id: number; cred: AmCredentials } | null>
): Promise<AutoMercadoScrapeResult> {
  const result: AutoMercadoScrapeResult = {
    fetched: 0,
    upserted: 0,
    errors: 0,
    loggedIn: false,
    credentialId: null,
    categoriesVisited: 0,
  };

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;

  try {
    const credEntry = await (loaderOverride
      ? loaderOverride()
      : findFirstCredential().then((c) => (c ? { id: c.id, cred: c.cred } : null)));
    result.credentialId = credEntry?.id ?? null;

    // Anti-bot detection. Multiple layers needed because AM uses Akamai-style
    // checks that look for the absence of normal browser APIs, not just the
    // presence of automation tells. Critical bits informed by web-scraper skill:
    //   - DON'T pass --disable-extensions (removes chrome.runtime → headless tell)
    //   - DO patch navigator.webdriver, chrome.runtime, navigator.plugins,
    //     Permissions.query notification quirk, Error.stack CDP traces
    browser = await chromium.launch({
      headless: true,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
      ],
    });
    context = await browser.newContext({
      userAgent: USER_AGENT,
      locale: "es-CR",
      viewport: { width: 1280, height: 900 },
      extraHTTPHeaders: {
        "sec-ch-ua": '"Chromium";v="148", "Not.A/Brand";v="24", "Google Chrome";v="148"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"macOS"',
      },
    });
    await context.addInitScript(() => {
      // 1. navigator.webdriver must be `undefined`, not `false` (matches real Chrome).
      Object.defineProperty(navigator, "webdriver", {
        get: () => undefined,
        configurable: true,
      });

      // 2. chrome.runtime must exist — its absence is Akamai's primary check.
      const w = window as unknown as { chrome?: { runtime?: Record<string, unknown> } };
      if (!w.chrome) w.chrome = {};
      if (!w.chrome.runtime) w.chrome.runtime = {};

      // 3. navigator.plugins must be non-empty (headless Chrome returns empty array).
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5].map((i) => ({ name: `Plugin ${i}`, filename: `plugin${i}.dll` })),
      });

      // 4. navigator.languages must be a real array.
      Object.defineProperty(navigator, "languages", {
        get: () => ["es-CR", "es", "en-US", "en"],
      });

      // 5. Permissions.query for notifications returns wrong state under CDP.
      const originalQuery = (window.navigator.permissions as unknown as {
        query: (params: { name: string }) => Promise<PermissionStatus>;
      })?.query;
      if (originalQuery) {
        (window.navigator.permissions as unknown as {
          query: (params: { name: string }) => Promise<PermissionStatus>;
        }).query = (params) =>
          params.name === "notifications"
            ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
            : originalQuery(params);
      }
    });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(NAV_TIMEOUT);
    page.setDefaultTimeout(15_000);

    if (credEntry) {
      result.loggedIn = await tryLogin(page, credEntry.cred);
      if (!result.loggedIn) console.warn(`[${CHAIN_ID}] login failed; scraping anonymously`);
    }

    // CRITICAL: visit /promociones first — that page seeds cookies/localStorage
    // that /categorias/* pages require to render their product grid. Without
    // this warm-up, every category page returns 0 cards. Discovered via diag.
    console.log(`[${CHAIN_ID}] seeding session via /promociones`);
    try {
      await page.goto(`${ORIGIN}/promociones`, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
      await page.waitForTimeout(6000);
      await dismissModals(page);
    } catch (err) {
      console.warn(`[${CHAIN_ID}] /promociones warm-up failed: ${err instanceof Error ? err.message : err}`);
    }

    const categories = await fetchCategoryUrls();
    console.log(`[${CHAIN_ID}] found ${categories.length} category URLs in sitemap`);
    if (categories.length === 0) throw new Error("No category URLs found");

    const limit = options.limit ?? 1000;
    const seenNames = new Set<string>();

    for (const categoryUrl of categories) {
      if (result.upserted >= limit) break;
      if (page.isClosed()) break;
      result.categoriesVisited++;
      try {
        await page.goto(categoryUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
        await page.waitForTimeout(PAGE_LOAD_WAIT);
        await dismissModals(page);
        await page.waitForSelector(".card.card-product", { timeout: 8000 }).catch(() => {});

        // Click "Ver más" repeatedly to surface the full category catalog.
        // AM uses click-to-load pagination, not infinite scroll. We cap at
        // 40 clicks (≈ 1200 products / category) to avoid runaway runs.
        const MAX_VER_MAS_CLICKS = 40;
        for (let i = 0; i < MAX_VER_MAS_CLICKS; i++) {
          const verMas = page.locator('button:has-text("Ver más"), a:has-text("Ver más")').first();
          if ((await verMas.count()) === 0) break;
          const isVisible = await verMas.isVisible().catch(() => false);
          if (!isVisible) break;
          await verMas.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
          await verMas.click({ timeout: 3000 }).catch(() => {});
          // Wait for new cards to render.
          await page.waitForTimeout(1500);
        }

        // Final scroll pass — surfaces lazy-loaded images / late renders.
        for (let i = 0; i < LAZY_SCROLLS; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await page.waitForTimeout(SCROLL_PAUSE);
        }

        const items = await extractProducts(page);
        result.fetched += items.length;

        for (const item of items) {
          if (result.upserted >= limit) break;
          // Prefer SKU-based dedup (AM's product GUID is stable). Fall back to name.
          const dedupKey = item.sku ?? `${item.name}::${item.brand ?? ""}`;
          if (seenNames.has(dedupKey)) continue;
          seenNames.add(dedupKey);

          try {
            await onProduct({
              name: item.name,
              brand: item.brand,
              imageUrl: item.imageUrl,
              price: item.price,
              currency: "CRC",
              sourceUrl: item.productUrl ?? categoryUrl,
            });
            result.upserted++;
          } catch (err) {
            result.errors++;
            console.warn(`[${CHAIN_ID}] persist failed for ${item.name}: ${err instanceof Error ? err.message : err}`);
          }
        }

        console.log(`[${CHAIN_ID}] ${categoryUrl}: ${items.length} cards (total: ${result.upserted})`);
      } catch (err) {
        result.errors++;
        console.warn(`[${CHAIN_ID}] category ${categoryUrl} failed: ${err instanceof Error ? err.message : err}`);
      }
    }
  } finally {
    if (context) await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }

  return result;
}

export const automercadoMeta = {
  chainId: CHAIN_ID,
  chainName: CHAIN_NAME,
  loadCredentialsForUser,
  findFirstCredential,
};
