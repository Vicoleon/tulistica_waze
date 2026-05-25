/**
 * Generic VTEX scraper.
 *
 * VTEX powers Walmart Costa Rica, MaxiPalí and Más x Menos. They expose
 * a public catalog API: `/api/catalog_system/pub/products/search?_from=N&_to=M`
 * which returns up to 50 products per call (no auth required).
 *
 * We page through the catalog directly instead of parsing HTML — faster and
 * gives us clean structured data including barcode, brand, price, and image.
 */

import { BaseScraper, normalizeBarcode, sleep, type ProductData, type ScrapeOptions } from "./base";

interface VtexItem {
  itemId: string;
  ean?: string;
  referenceId?: Array<{ Key: string; Value: string }>;
  images?: Array<{ imageUrl: string }>;
  unitMultiplier?: number;
  measurementUnit?: string;
  sellers?: Array<{
    commertialOffer?: {
      Price?: number;
      ListPrice?: number;
      AvailableQuantity?: number;
    };
  }>;
}

interface VtexProduct {
  productId: string;
  productName?: string;
  brand?: string;
  description?: string;
  link?: string;
  linkText?: string;
  categories?: string[];
  items?: VtexItem[];
}

interface VtexConfig {
  chainId: string;
  chainName: string;
  origin: string;
}

const PAGE_SIZE = 50;
const MAX_VTEX_OFFSET = 2500; // VTEX caps at 2500 per query path

export class VtexScraper extends BaseScraper {
  readonly chainId: string;
  readonly chainName: string;
  readonly origin: string;

  constructor(config: VtexConfig) {
    super();
    this.chainId = config.chainId;
    this.chainName = config.chainName;
    this.origin = config.origin;
    // VTEX APIs handle higher throughput than HTML pages.
    this.delayMs = 800;
  }

  /**
   * VTEX exposes products via the catalog API, paged in chunks of 50.
   * Each "URL" we yield is actually an API call URL (1 call = 50 products).
   */
  async *listProductUrls(options: ScrapeOptions): AsyncIterable<string> {
    const limit = options.limit ?? 1000;
    const pages = Math.ceil(Math.min(limit, MAX_VTEX_OFFSET) / PAGE_SIZE);
    for (let page = 0; page < pages; page++) {
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      yield `${this.origin}/api/catalog_system/pub/products/search?_from=${from}&_to=${to}`;
    }
  }

  /**
   * Override parseProduct to NOT be called — we batch-fetch instead.
   * Each yielded URL returns up to 50 products; we expose batch fetching below.
   */
  async parseProduct(): Promise<ProductData | null> {
    throw new Error("VtexScraper uses fetchBatch, not parseProduct");
  }

  async fetchBatch(url: string): Promise<ProductData[]> {
    const res = await this.politeFetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as VtexProduct[];
    if (!Array.isArray(json)) return [];

    const results: ProductData[] = [];
    for (const product of json) {
      const item = product.items?.[0];
      const seller = item?.sellers?.[0];
      const offer = seller?.commertialOffer;
      const price = offer?.Price;
      if (!price || price <= 0) continue;
      // Skip out-of-stock products
      if ((offer?.AvailableQuantity ?? 0) <= 0) continue;
      const ean = normalizeBarcode(item?.ean);
      const image = item?.images?.[0]?.imageUrl;
      const category = product.categories?.[0]
        ?.replace(/^\/+|\/+$/g, "")
        .split("/")
        .pop();

      const linkText = product.linkText ?? product.productId;
      const sourceUrl = `${this.origin}/${linkText}/p`;

      results.push({
        barcode: ean,
        name: (product.productName ?? "").trim(),
        brand: product.brand?.trim() || undefined,
        category,
        description: product.description?.trim() || undefined,
        imageUrl: image,
        unit: item?.measurementUnit || undefined,
        unitSize: item?.unitMultiplier && item.unitMultiplier !== 1 ? item.unitMultiplier : undefined,
        price,
        currency: "CRC",
        sourceUrl,
      });
    }
    return results;
  }
}

export async function scrapeVtex(
  scraper: VtexScraper,
  options: ScrapeOptions,
  onProduct: (data: ProductData) => Promise<void>
): Promise<void> {
  const limit = options.limit ?? 1000;
  let upserted = 0;
  for await (const url of scraper.listProductUrls(options)) {
    const batch = await scraper.fetchBatch(url);
    for (const item of batch) {
      if (upserted >= limit) return;
      try {
        await onProduct(item);
        upserted++;
      } catch (err) {
        console.warn(`[${scraper.chainId}] persist failed for ${item.sourceUrl}:`, err);
      }
    }
    // Tiny breather between batches even though politeFetch already waits.
    await sleep(50);
  }
}
