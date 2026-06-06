/**
 * Base scraper utilities — robots.txt respect, polite rate-limiting,
 * retries with jitter, and shared parsing helpers.
 *
 * Each chain-specific scraper extends BaseScraper and implements:
 *   - listProductUrls(): produces product detail URLs (from sitemap, category pages, etc.)
 *   - parseProduct(html, url): extracts ProductData from a product page
 *
 * Run scrapers via `pnpm tsx scripts/run-scraper.ts <chain> [--limit N]`.
 */

import { load, type CheerioAPI } from "cheerio";
import robotsParser from "robots-parser";

export interface ProductData {
  /** EAN/UPC barcode if present. */
  barcode?: string;
  name: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  description?: string;
  imageUrl?: string;
  unit?: string;
  unitSize?: number;
  /** Current price observed on this page. */
  price: number;
  /** Currency code (always CRC for now). */
  currency: "CRC";
  /** Optional canonical source URL we scraped from. */
  sourceUrl: string;
}

export interface ScrapeStats {
  fetched: number;
  parsed: number;
  upserted: number;
  skipped: number;
  errors: number;
}

export interface ScrapeOptions {
  /** Stop after this many successful upserts. */
  limit?: number;
  /** Override polite delay between requests, in ms. Default 1500. */
  delayMs?: number;
  /** When false, ignore robots.txt (only enable explicitly for testing). */
  respectRobots?: boolean;
}

const DEFAULT_USER_AGENT =
  "TulisticaBot/1.0 (+https://tulistica.com/bot; community price comparison)";

/**
 * Polite fetcher with retries, jitter and a single in-flight queue.
 * Each scraper instance keeps its own state so two chains don't share a robots cache.
 */
export abstract class BaseScraper {
  abstract readonly chainId: string;
  abstract readonly chainName: string;
  /** Origin used to fetch /robots.txt. */
  abstract readonly origin: string;

  protected delayMs = 1500;
  protected respectRobots = true;
  protected userAgent = DEFAULT_USER_AGENT;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private robots: any | null = null;
  private lastFetchAt = 0;

  protected async loadRobots(): Promise<void> {
    if (!this.respectRobots || this.robots) return;
    const robotsUrl = new URL("/robots.txt", this.origin).toString();
    try {
      const res = await fetch(robotsUrl, {
        headers: { "User-Agent": this.userAgent },
      });
      const body = res.ok ? await res.text() : "";
      this.robots = robotsParser(robotsUrl, body);
    } catch {
      // If robots.txt can't be fetched, fall back to "allow all" but keep being polite.
      this.robots = robotsParser(robotsUrl, "");
    }
  }

  protected canFetch(url: string): boolean {
    if (!this.respectRobots) return true;
    if (!this.robots) return true;
    return this.robots.isAllowed(url, this.userAgent) !== false;
  }

  protected async politeFetch(url: string): Promise<Response> {
    await this.loadRobots();
    if (!this.canFetch(url)) {
      throw new Error(`[${this.chainId}] robots.txt disallows ${url}`);
    }

    // Rate limit: ensure at least delayMs since last request.
    const now = Date.now();
    const wait = Math.max(0, this.delayMs - (now - this.lastFetchAt));
    if (wait > 0) await sleep(wait + Math.random() * 200);
    this.lastFetchAt = Date.now();

    return this.fetchWithRetry(url);
  }

  private async fetchWithRetry(url: string, attempt = 0): Promise<Response> {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": this.userAgent,
          Accept: "text/html,application/xhtml+xml,application/json;q=0.9",
          "Accept-Language": "es-CR,es;q=0.9,en;q=0.5",
        },
      });
      if (res.status >= 500 && attempt < 2) {
        await sleep(2000 * (attempt + 1));
        return this.fetchWithRetry(url, attempt + 1);
      }
      return res;
    } catch (err) {
      if (attempt < 2) {
        await sleep(2000 * (attempt + 1));
        return this.fetchWithRetry(url, attempt + 1);
      }
      throw err;
    }
  }

  protected async fetchHtml(url: string): Promise<CheerioAPI | null> {
    const res = await this.politeFetch(url);
    if (!res.ok) return null;
    const html = await res.text();
    return load(html);
  }

  /** Parse Schema.org Product JSON-LD embedded in product pages. */
  protected parseJsonLdProduct($: CheerioAPI): Partial<ProductData> | null {
    let found: Partial<ProductData> | null = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      if (found) return;
      const raw = $(el).contents().text();
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        const items: unknown[] = Array.isArray(data) ? data : [data];
        for (const item of items) {
          const parsed = extractProductFromJsonLd(item);
          if (parsed) {
            found = parsed;
            break;
          }
        }
      } catch {
        // ignore — not all script tags are valid JSON
      }
    });
    return found;
  }

  /**
   * Discover product detail URLs. Subclasses can yield in chunks for
   * memory efficiency on large sites.
   */
  abstract listProductUrls(options: ScrapeOptions): AsyncIterable<string>;

  /** Parse a single product page into ProductData. */
  abstract parseProduct(url: string): Promise<ProductData | null>;
}

function extractProductFromJsonLd(item: unknown): Partial<ProductData> | null {
  if (!item || typeof item !== "object") return null;
  const obj = item as Record<string, unknown>;
  const type = obj["@type"];
  const isProduct = type === "Product" || (Array.isArray(type) && type.includes("Product"));
  if (!isProduct) return null;

  const offers = pickFirst(obj.offers);
  const offer = offers && typeof offers === "object" ? (offers as Record<string, unknown>) : null;

  const priceRaw = offer?.price ?? offer?.lowPrice ?? offer?.highPrice;
  const price = typeof priceRaw === "number" ? priceRaw : parseFloat(String(priceRaw ?? ""));
  if (!price || Number.isNaN(price)) return null;

  const brandRaw = obj.brand;
  const brand =
    typeof brandRaw === "string"
      ? brandRaw
      : (brandRaw && typeof brandRaw === "object" && (brandRaw as Record<string, unknown>).name) || undefined;

  return {
    name: String(obj.name ?? "").trim(),
    brand: typeof brand === "string" ? brand.trim() : undefined,
    description: typeof obj.description === "string" ? obj.description : undefined,
    imageUrl: pickFirstString(obj.image),
    barcode:
      pickFirstString(obj.gtin13) ??
      pickFirstString(obj.gtin12) ??
      pickFirstString(obj.gtin) ??
      pickFirstString(obj.sku),
    category: typeof obj.category === "string" ? obj.category : undefined,
    price,
  };
}

function pickFirst(value: unknown): unknown {
  if (Array.isArray(value)) return value[0];
  return value;
}

function pickFirstString(value: unknown): string | undefined {
  const v = pickFirst(value);
  return typeof v === "string" ? v : undefined;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeBarcode(input?: string): string | undefined {
  if (!input) return undefined;
  const digits = input.replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 14) return undefined;
  return digits;
}
