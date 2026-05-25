/**
 * Persistence layer for scrapers — upserts products, links chain stores,
 * and creates price entries attributed to a synthetic scraper user.
 */

import { drizzle } from "drizzle-orm/mysql2";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import {
  priceEntries,
  priceHistory,
  products,
  stores,
  users,
} from "../../drizzle/schema";
import type { ProductData, ScrapeStats } from "./base";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required to run scrapers");
}

const db = drizzle(process.env.DATABASE_URL);

const SCRAPER_USER_BASE_OPEN_ID = "scraper:";

/**
 * Get-or-create a synthetic user that owns the scraped price entries.
 * Each chain has its own scraper user so we can audit / disable independently.
 */
async function getScraperUserId(chainId: string): Promise<number> {
  const openId = `${SCRAPER_USER_BASE_OPEN_ID}${chainId}`;
  const existing = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (existing[0]) return existing[0].id;

  await db.insert(users).values({
    openId,
    name: `Scraper · ${chainId}`,
    email: `${openId}@grocerywaze.local`,
    loginMethod: "scraper",
    trustScore: 100, // scraped prices come straight from the merchant
  });
  const inserted = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  if (!inserted[0]) throw new Error("Failed to create scraper user");
  return inserted[0].id;
}

/**
 * Get-or-create a placeholder "chain-wide" store for online prices. Future work
 * will distribute online prices to physical stores, but for now we attribute
 * scraped prices to a single virtual storefront per chain.
 */
async function getChainStoreId(chainId: string, chainName: string): Promise<number> {
  const result = await db
    .select()
    .from(stores)
    .where(and(eq(stores.chainId, chainId), eq(stores.name, `${chainName} (en línea)`)))
    .limit(1);
  if (result[0]) return result[0].id;

  await db.insert(stores).values({
    name: `${chainName} (en línea)`,
    chainId,
    address: "Sitio web",
    city: "San José",
    latitude: 9.9281,
    longitude: -84.0907,
    isActive: true,
  });
  const inserted = await db
    .select()
    .from(stores)
    .where(and(eq(stores.chainId, chainId), eq(stores.name, `${chainName} (en línea)`)))
    .limit(1);
  if (!inserted[0]) throw new Error("Failed to create chain store");
  return inserted[0].id;
}

async function upsertProduct(data: ProductData): Promise<number> {
  // Prefer barcode match — strongest identity signal.
  if (data.barcode) {
    const byBarcode = await db
      .select()
      .from(products)
      .where(eq(products.barcode, data.barcode))
      .limit(1);
    if (byBarcode[0]) {
      await db
        .update(products)
        .set({
          name: data.name,
          brand: data.brand ?? byBarcode[0].brand,
          category: data.category ?? byBarcode[0].category,
          imageUrl: data.imageUrl ?? byBarcode[0].imageUrl,
        })
        .where(eq(products.id, byBarcode[0].id));
      return byBarcode[0].id;
    }
  } else {
    // No barcode (~5% of scraped items: fresh produce, bulk goods, etc.).
    // Match by (name, brand) so daily refreshes don't duplicate the same row.
    // brand can be null — handle both cases without LIKE/wildcards to keep the
    // match exact and avoid accidentally merging "Arroz 1kg" with "Arroz 2kg".
    const brandCondition = data.brand
      ? eq(products.brand, data.brand)
      : isNull(products.brand);
    const byNameBrand = await db
      .select()
      .from(products)
      .where(
        and(
          isNull(products.barcode),
          eq(products.name, data.name),
          brandCondition
        )
      )
      .limit(1);
    if (byNameBrand[0]) {
      await db
        .update(products)
        .set({
          category: data.category ?? byNameBrand[0].category,
          imageUrl: data.imageUrl ?? byNameBrand[0].imageUrl,
        })
        .where(eq(products.id, byNameBrand[0].id));
      return byNameBrand[0].id;
    }
  }

  // Truly new product — insert and look it back up.
  await db.insert(products).values({
    barcode: data.barcode ?? null,
    name: data.name,
    brand: data.brand ?? null,
    category: data.category ?? null,
    subcategory: data.subcategory ?? null,
    description: data.description ?? null,
    imageUrl: data.imageUrl ?? null,
    unit: data.unit ?? null,
    unitSize: data.unitSize ?? null,
  });

  if (data.barcode) {
    const inserted = await db
      .select()
      .from(products)
      .where(eq(products.barcode, data.barcode))
      .limit(1);
    if (inserted[0]) return inserted[0].id;
  }
  // For no-barcode products use the same (name, brand) lookup to avoid races.
  const brandCondition = data.brand ? eq(products.brand, data.brand) : isNull(products.brand);
  const fallback = await db
    .select()
    .from(products)
    .where(and(eq(products.name, data.name), brandCondition))
    .orderBy(desc(products.id))
    .limit(1);
  if (!fallback[0]) throw new Error(`Failed to locate just-inserted product: ${data.name}`);
  return fallback[0].id;
}

/**
 * Record a scraped price.
 *
 * `price_entries` is the "current price per (store, product)" table — daily
 * refresh updates the existing row in place when the price is unchanged, and
 * inserts a new row only when the price actually moved. This keeps the table
 * bounded at roughly `stores × products` rows instead of growing linearly
 * with refresh count.
 *
 * `price_history` is the append-only time series — every observation gets a
 * row so we can chart price trends over time.
 */
export async function recordScrapedProduct(
  chainId: string,
  chainName: string,
  data: ProductData
): Promise<void> {
  const [productId, storeId, scraperUserId] = await Promise.all([
    upsertProduct(data),
    getChainStoreId(chainId, chainName),
    getScraperUserId(chainId),
  ]);

  // Find the latest scraper-owned entry for this (store, product).
  const existing = await db
    .select()
    .from(priceEntries)
    .where(
      and(
        eq(priceEntries.storeId, storeId),
        eq(priceEntries.productId, productId),
        eq(priceEntries.userId, scraperUserId)
      )
    )
    .orderBy(desc(priceEntries.createdAt))
    .limit(1);

  if (existing[0]) {
    if (existing[0].price === data.price) {
      // Same price — touch updatedAt so we know it's still observed.
      await db
        .update(priceEntries)
        .set({ updatedAt: new Date() })
        .where(eq(priceEntries.id, existing[0].id));
    } else {
      // Price changed — overwrite the current entry so getLatestPrice still works.
      await db
        .update(priceEntries)
        .set({ price: data.price, updatedAt: new Date() })
        .where(eq(priceEntries.id, existing[0].id));
    }
  } else {
    await db.insert(priceEntries).values({
      storeId,
      productId,
      userId: scraperUserId,
      price: data.price,
      isVerified: true,
      isOutlier: false,
      withinGeofence: false,
    });
  }

  // History is intentionally append-only — but skip if the latest history
  // point matches the current price (avoids spamming flat-price periods).
  const latestHistory = await db
    .select()
    .from(priceHistory)
    .where(and(eq(priceHistory.storeId, storeId), eq(priceHistory.productId, productId)))
    .orderBy(desc(priceHistory.recordedAt))
    .limit(1);
  if (!latestHistory[0] || latestHistory[0].price !== data.price) {
    await db.insert(priceHistory).values({
      storeId,
      productId,
      price: data.price,
    });
  }
}

export function emptyStats(): ScrapeStats {
  return { fetched: 0, parsed: 0, upserted: 0, skipped: 0, errors: 0 };
}
