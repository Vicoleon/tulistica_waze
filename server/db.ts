import { eq, and, desc, asc, sql, gte, lte, like, or, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, stores, products, priceEntries, priceHistory,
  shoppingLists, listMembers, listItems, pantryItems, purchaseHistory,
  adCampaigns, achievements, userAchievements, leaderboard, priceVotes,
  savedRecipes, InsertStore, InsertProduct, InsertPriceEntry,
  InsertShoppingList, InsertListItem, InsertPantryItem, InsertAdCampaign,
  InsertSavedRecipe, priceAlerts, InsertPriceAlert, storeCrowdedness,
  InsertStoreCrowdedness, googlePlacesCache, InsertGooglePlaceCache,
  brands, brandTokens, campaignMetrics, invoices, invoiceLineItems,
  InsertBrand, InsertBrandToken, InsertCampaignMetric, InsertInvoice,
  InsertInvoiceLineItem,
  analyticsEvents, InsertAnalyticsEvent,
  integrationCredentials, InsertIntegrationCredential, appSettings,
  userTokens, brandMembers,
  vendorApplications,
  storeClaims,
} from "../drizzle/schema";
import type { User, Brand, Store, UserToken, InsertUserToken, BrandMember, InsertBrandMember, VendorApplication, InsertVendorApplication, StoreClaim, InsertStoreClaim } from "../drizzle/schema";
import type { AnalyticsProperties } from "../shared/analytics";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Best-effort coercion of a DB date-ish value into a YYYY-MM-DD string.
 * MySQL DATE columns come back as Date objects with Local time zero hours,
 * but a NaN value or a string like "0000-00-00" needs defensive handling.
 * Returns `null` when the input can't be interpreted as a real date.
 */
function toIsoDate(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    const t = value.getTime();
    if (!Number.isFinite(t) || t <= 0) return null;
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    // MySQL DATE → "YYYY-MM-DD" (already in the format we want).
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const parsed = new Date(value);
    return Number.isFinite(parsed.getTime()) && parsed.getTime() > 0
      ? parsed.toISOString().slice(0, 10)
      : null;
  }
  return null;
}

let _dbProbed = false;
let _dbHealthy = false;

export async function getDb() {
  if (!process.env.DATABASE_URL) return null;
  if (!_db) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to construct drizzle client:", error);
      _db = null;
      return null;
    }
  }
  // Probe once on first use — if the connection fails, treat as no-DB
  // for the rest of the process so callers fall back to mock paths
  // rather than crashing on every query.
  if (!_dbProbed) {
    _dbProbed = true;
    try {
      await _db.execute(sql`SELECT 1`);
      _dbHealthy = true;
    } catch (error) {
      console.warn(
        "[Database] Health-check failed — running in no-DB mode. " +
        "Set DATABASE_URL to a reachable MySQL to enable persistence:",
        (error as Error)?.message ?? error
      );
      _dbHealthy = false;
    }
  }
  return _dbHealthy ? _db : null;
}

// ============ USER HELPERS ============
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};

  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  });

  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = 'super_admin';
    updateSet.role = 'super_admin';
  }

  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0];
}

export async function updateUserTrustScore(userId: number, delta: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users)
    .set({ trustScore: sql`GREATEST(0, LEAST(100, ${users.trustScore} + ${delta}))` })
    .where(eq(users.id, userId));
}

export async function updateUserPoints(userId: number, points: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users)
    .set({ totalPoints: sql`${users.totalPoints} + ${points}` })
    .where(eq(users.id, userId));
}

export async function updateUserLocation(userId: number, lat: number, lng: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(users)
    .set({ homeLatitude: lat, homeLongitude: lng })
    .where(eq(users.id, userId));
}

export async function updateUserPreferences(userId: number, prefs: {
  defaultRadiusKm?: number;
  fuelCostPerKm?: number;
  timeValuePerHour?: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set(prefs).where(eq(users.id, userId));
}

/**
 * Process-memory fallback for user.preferences when no DB is connected.
 * Lets MOCK_AUTH dev mode persist onboarding answers across requests within
 * the same process (lost on server restart — that's the cost of no DB).
 * Keyed by userId; never read in production where the DB is healthy.
 */
const _mockPreferencesStore = new Map<number, import("../shared/profile").UserPreferences>();

export function getMockPreferences(userId: number): import("../shared/profile").UserPreferences | undefined {
  return _mockPreferencesStore.get(userId);
}

/**
 * Merge the user's `preferences` JSON column with `patch`. Keeps any
 * existing keys (e.g. dietaryRestrictions, favoriteStores) and overwrites
 * only the keys present in `patch`. Used by trpc.profile.update.
 *
 * Falls back to an in-memory store when the DB is unavailable so the
 * onboarding flow in MOCK_AUTH mode doesn't bounce the user back to the
 * onboarding page after they submit.
 */
export async function updateUserPreferencesJson(
  userId: number,
  patch: Partial<import("../shared/profile").UserPreferences>
) {
  const db = await getDb();
  if (!db) {
    const current = _mockPreferencesStore.get(userId) ?? {};
    _mockPreferencesStore.set(userId, { ...current, ...patch });
    return;
  }
  const row = await db
    .select({ preferences: users.preferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const current = row[0]?.preferences ?? {};
  const next = { ...current, ...patch };
  await db.update(users).set({ preferences: next }).where(eq(users.id, userId));
}

// ============ STORE HELPERS ============
export async function createStore(store: InsertStore) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(stores).values(store);
  return result[0].insertId;
}

export async function getStoreById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(stores).where(eq(stores.id, id)).limit(1);
  return result[0];
}

export async function getNearbyStores(lat: number, lng: number, radiusKm: number) {
  const db = await getDb();
  if (!db) return [];
  // Haversine formula for distance calculation
  const result = await db.select({
    id: stores.id,
    name: stores.name,
    chainId: stores.chainId,
    address: stores.address,
    city: stores.city,
    latitude: stores.latitude,
    longitude: stores.longitude,
    imageUrl: stores.imageUrl,
    avgRating: stores.avgRating,
    hours: stores.hours,
    distanceKm: sql<number>`(
      6371 * acos(
        cos(radians(${lat})) * cos(radians(${stores.latitude})) *
        cos(radians(${stores.longitude}) - radians(${lng})) +
        sin(radians(${lat})) * sin(radians(${stores.latitude}))
      )
    )`.as('distanceKm'),
  })
    .from(stores)
    .where(eq(stores.isActive, true))
    .having(sql`distanceKm <= ${radiusKm}`)
    .orderBy(sql`distanceKm`);
  return result;
}

export async function searchStores(query: string, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(stores)
    .where(and(
      eq(stores.isActive, true),
      or(
        like(stores.name, `%${query}%`),
        like(stores.chainId, `%${query}%`),
        like(stores.city, `%${query}%`)
      )
    ))
    .limit(limit);
}

// ============ PRODUCT HELPERS ============
export async function createProduct(product: InsertProduct) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(products).values(product);
  return result[0].insertId;
}

export async function getProductById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(products).where(eq(products.id, id)).limit(1);
  return result[0];
}

export async function getProductByBarcode(barcode: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(products).where(eq(products.barcode, barcode)).limit(1);
  return result[0];
}

export async function searchProducts(query: string, limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products)
    .where(or(
      like(products.name, `%${query}%`),
      like(products.brand, `%${query}%`),
      like(products.category, `%${query}%`),
      like(products.searchKeywords, `%${query}%`)
    ))
    .limit(limit);
}

export async function getProductsByCategory(category: string, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(products)
    .where(eq(products.category, category))
    .limit(limit);
}

export async function getProductsByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db.select().from(products).where(inArray(products.id, ids));
}

// ============ PRICE ENTRY HELPERS ============
export async function createPriceEntry(entry: InsertPriceEntry) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(priceEntries).values(entry);
  // Also add to price history
  await db.insert(priceHistory).values({
    storeId: entry.storeId,
    productId: entry.productId,
    price: entry.price,
  });
  return result[0].insertId;
}

export async function getLatestPrice(storeId: number, productId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(priceEntries)
    .where(and(
      eq(priceEntries.storeId, storeId),
      eq(priceEntries.productId, productId),
      eq(priceEntries.isOutlier, false)
    ))
    .orderBy(desc(priceEntries.createdAt))
    .limit(1);
  return result[0];
}

export async function getPricesForProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];
  // Get latest price per store
  return db.select({
    storeId: priceEntries.storeId,
    storeName: stores.name,
    chainId: stores.chainId,
    price: priceEntries.price,
    isVerified: priceEntries.isVerified,
    updatedAt: priceEntries.updatedAt,
    voteCount: priceEntries.voteCount,
  })
    .from(priceEntries)
    .innerJoin(stores, eq(priceEntries.storeId, stores.id))
    .where(and(
      eq(priceEntries.productId, productId),
      eq(priceEntries.isOutlier, false)
    ))
    .orderBy(desc(priceEntries.createdAt));
}

export async function getPriceMatrix(storeIds: number[], productIds: number[]) {
  const db = await getDb();
  if (!db || storeIds.length === 0 || productIds.length === 0) return [];
  return db.select({
    storeId: priceEntries.storeId,
    productId: priceEntries.productId,
    price: priceEntries.price,
    isVerified: priceEntries.isVerified,
  })
    .from(priceEntries)
    .where(and(
      inArray(priceEntries.storeId, storeIds),
      inArray(priceEntries.productId, productIds),
      eq(priceEntries.isOutlier, false)
    ))
    .orderBy(desc(priceEntries.createdAt));
}

export async function getPriceStats(storeId: number, productId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({
    avgPrice: sql<number>`AVG(${priceEntries.price})`,
    stdDev: sql<number>`STDDEV(${priceEntries.price})`,
    count: sql<number>`COUNT(*)`,
    minPrice: sql<number>`MIN(${priceEntries.price})`,
    maxPrice: sql<number>`MAX(${priceEntries.price})`,
  })
    .from(priceEntries)
    .where(and(
      eq(priceEntries.storeId, storeId),
      eq(priceEntries.productId, productId),
      eq(priceEntries.isOutlier, false),
      gte(priceEntries.createdAt, sql`DATE_SUB(NOW(), INTERVAL 30 DAY)`)
    ));
  return result[0];
}

export async function getPriceHistory(storeId: number, productId: number, days = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(priceHistory)
    .where(and(
      eq(priceHistory.storeId, storeId),
      eq(priceHistory.productId, productId),
      gte(priceHistory.recordedAt, sql`DATE_SUB(NOW(), INTERVAL ${days} DAY)`)
    ))
    .orderBy(asc(priceHistory.recordedAt));
}

export async function updatePriceVerification(priceId: number, isVerified: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(priceEntries)
    .set({ isVerified })
    .where(eq(priceEntries.id, priceId));
}

export async function markPriceAsOutlier(priceId: number, zScore: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(priceEntries)
    .set({ isOutlier: true, zScore })
    .where(eq(priceEntries.id, priceId));
}

export async function incrementPriceVote(priceId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(priceEntries)
    .set({ voteCount: sql`${priceEntries.voteCount} + 1` })
    .where(eq(priceEntries.id, priceId));
}

// ============ SHOPPING LIST HELPERS ============
export async function createShoppingList(list: InsertShoppingList) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(shoppingLists).values(list);
  return result[0].insertId;
}

export async function getShoppingListById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(shoppingLists).where(eq(shoppingLists.id, id)).limit(1);
  return result[0];
}

export async function getShoppingListByShareCode(code: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(shoppingLists).where(eq(shoppingLists.shareCode, code)).limit(1);
  return result[0];
}

export async function getUserShoppingLists(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Get owned lists and shared lists
  const owned = await db.select().from(shoppingLists).where(eq(shoppingLists.ownerId, userId));
  const memberOf = await db.select({ listId: listMembers.listId })
    .from(listMembers).where(eq(listMembers.userId, userId));
  const sharedListIds = memberOf.map(m => m.listId);
  const shared = sharedListIds.length > 0
    ? await db.select().from(shoppingLists).where(inArray(shoppingLists.id, sharedListIds))
    : [];
  return [...owned, ...shared];
}

export async function updateShoppingList(id: number, data: Partial<InsertShoppingList>) {
  const db = await getDb();
  if (!db) return;
  await db.update(shoppingLists).set(data).where(eq(shoppingLists.id, id));
}

export async function deleteShoppingList(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(listItems).where(eq(listItems.listId, id));
  await db.delete(listMembers).where(eq(listMembers.listId, id));
  await db.delete(shoppingLists).where(eq(shoppingLists.id, id));
}

// ============ LIST ITEM HELPERS ============
export async function addListItem(item: InsertListItem) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(listItems).values(item);
  return result[0].insertId;
}

export async function getListItems(listId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: listItems.id,
    listId: listItems.listId,
    productId: listItems.productId,
    customName: listItems.customName,
    quantity: listItems.quantity,
    unit: listItems.unit,
    isChecked: listItems.isChecked,
    checkedByUserId: listItems.checkedByUserId,
    checkedAt: listItems.checkedAt,
    notes: listItems.notes,
    productName: products.name,
    productBarcode: products.barcode,
    productCategory: products.category,
  })
    .from(listItems)
    .leftJoin(products, eq(listItems.productId, products.id))
    .where(eq(listItems.listId, listId))
    .orderBy(asc(listItems.createdAt));
}

export async function updateListItem(id: number, data: Partial<InsertListItem>) {
  const db = await getDb();
  if (!db) return;
  await db.update(listItems).set(data).where(eq(listItems.id, id));
}

export async function checkListItem(id: number, userId: number, isChecked: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(listItems).set({
    isChecked,
    checkedByUserId: isChecked ? userId : null,
    checkedAt: isChecked ? new Date() : null,
  }).where(eq(listItems.id, id));
}

export async function deleteListItem(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(listItems).where(eq(listItems.id, id));
}

// ============ LIST MEMBER HELPERS ============
export async function addListMember(listId: number, userId: number, canEdit = true) {
  const db = await getDb();
  if (!db) return;
  await db.insert(listMembers).values({ listId, userId, canEdit });
}

export async function getListMembers(listId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    userId: listMembers.userId,
    canEdit: listMembers.canEdit,
    userName: users.name,
  })
    .from(listMembers)
    .innerJoin(users, eq(listMembers.userId, users.id))
    .where(eq(listMembers.listId, listId));
}

export async function removeListMember(listId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(listMembers).where(and(
    eq(listMembers.listId, listId),
    eq(listMembers.userId, userId)
  ));
}

// ============ PANTRY HELPERS ============
export async function addPantryItem(item: InsertPantryItem) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(pantryItems).values(item);
  return result[0].insertId;
}

export async function getUserPantry(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: pantryItems.id,
    productId: pantryItems.productId,
    customName: pantryItems.customName,
    quantity: pantryItems.quantity,
    lastPurchasedAt: pantryItems.lastPurchasedAt,
    avgDaysBetweenPurchases: pantryItems.avgDaysBetweenPurchases,
    purchaseCount: pantryItems.purchaseCount,
    notifyWhenLow: pantryItems.notifyWhenLow,
    productName: products.name,
    productCategory: products.category,
  })
    .from(pantryItems)
    .leftJoin(products, eq(pantryItems.productId, products.id))
    .where(eq(pantryItems.userId, userId));
}

export async function updatePantryItem(id: number, data: Partial<InsertPantryItem>) {
  const db = await getDb();
  if (!db) return;
  await db.update(pantryItems).set(data).where(eq(pantryItems.id, id));
}

export async function recordPurchase(userId: number, productId: number, storeId: number | null, price: number | null, quantity = 1) {
  const db = await getDb();
  if (!db) return;
  // Add to purchase history
  await db.insert(purchaseHistory).values({
    userId, productId, storeId, price, quantity
  });
  // Update pantry item's purchase tracking
  const pantryItem = await db.select().from(pantryItems)
    .where(and(eq(pantryItems.userId, userId), eq(pantryItems.productId, productId)))
    .limit(1);
  if (pantryItem[0]) {
    const lastPurchase = pantryItem[0].lastPurchasedAt;
    const daysSince = lastPurchase
      ? Math.floor((Date.now() - lastPurchase.getTime()) / (1000 * 60 * 60 * 24))
      : null;
    const currentAvg = pantryItem[0].avgDaysBetweenPurchases || 0;
    const count = pantryItem[0].purchaseCount || 0;
    const newAvg = daysSince !== null && count > 0
      ? (currentAvg * count + daysSince) / (count + 1)
      : currentAvg;
    await db.update(pantryItems).set({
      lastPurchasedAt: new Date(),
      avgDaysBetweenPurchases: newAvg || daysSince || 7,
      purchaseCount: count + 1,
      quantity: (pantryItem[0]?.quantity ?? 0) + quantity,
    }).where(eq(pantryItems.id, pantryItem[0].id));
  }
}

export async function getPantryRestockSuggestions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  // Find items that are due for restock based on purchase patterns
  return db.select({
    id: pantryItems.id,
    productId: pantryItems.productId,
    customName: pantryItems.customName,
    quantity: pantryItems.quantity,
    lastPurchasedAt: pantryItems.lastPurchasedAt,
    avgDaysBetweenPurchases: pantryItems.avgDaysBetweenPurchases,
    productName: products.name,
    daysSinceLastPurchase: sql<number>`DATEDIFF(NOW(), ${pantryItems.lastPurchasedAt})`,
  })
    .from(pantryItems)
    .leftJoin(products, eq(pantryItems.productId, products.id))
    .where(and(
      eq(pantryItems.userId, userId),
      eq(pantryItems.notifyWhenLow, true),
      sql`DATEDIFF(NOW(), ${pantryItems.lastPurchasedAt}) >= ${pantryItems.avgDaysBetweenPurchases}`
    ));
}

// ============ AD CAMPAIGN HELPERS ============
export async function getSponsoredProducts(keywords: string[], limit = 5) {
  const db = await getDb();
  if (!db) return [];
  const now = new Date();
  return db.select({
    id: adCampaigns.id,
    productId: adCampaigns.productId,
    title: adCampaigns.title,
    description: adCampaigns.description,
    imageUrl: adCampaigns.imageUrl,
    bidCpc: adCampaigns.bidCpc,
    productName: products.name,
    productCategory: products.category,
  })
    .from(adCampaigns)
    .innerJoin(products, eq(adCampaigns.productId, products.id))
    .where(and(
      eq(adCampaigns.type, "sponsored_search"),
      eq(adCampaigns.isActive, true),
      or(lte(adCampaigns.activeFrom, now), sql`${adCampaigns.activeFrom} IS NULL`),
      or(gte(adCampaigns.activeUntil, now), sql`${adCampaigns.activeUntil} IS NULL`)
    ))
    .orderBy(desc(adCampaigns.bidCpc))
    .limit(limit);
}

export async function getCartSuggestions(cartCategories: string[]) {
  const db = await getDb();
  if (!db || cartCategories.length === 0) return [];
  const now = new Date();
  return db.select({
    id: adCampaigns.id,
    productId: adCampaigns.productId,
    title: adCampaigns.title,
    description: adCampaigns.description,
    imageUrl: adCampaigns.imageUrl,
    productName: products.name,
  })
    .from(adCampaigns)
    .innerJoin(products, eq(adCampaigns.productId, products.id))
    .where(and(
      eq(adCampaigns.type, "cart_suggestion"),
      eq(adCampaigns.isActive, true),
      or(lte(adCampaigns.activeFrom, now), sql`${adCampaigns.activeFrom} IS NULL`),
      or(gte(adCampaigns.activeUntil, now), sql`${adCampaigns.activeUntil} IS NULL`)
    ))
    .orderBy(desc(adCampaigns.bidCpc))
    .limit(3);
}

export async function recordAdImpression(adId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(adCampaigns)
    .set({ impressions: sql`${adCampaigns.impressions} + 1` })
    .where(eq(adCampaigns.id, adId));

  const campaign = await db.select({ brandId: adCampaigns.brandId })
    .from(adCampaigns)
    .where(eq(adCampaigns.id, adId))
    .limit(1);
  await bumpCampaignMetric({
    campaignId: adId,
    brandId: campaign[0]?.brandId ?? null,
    impressions: 1,
  });
}

export async function recordAdClick(adId: number) {
  const db = await getDb();
  if (!db) return;
  // Fetch the bid + current daily spend in one round-trip so we can reset
  // the daily counter atomically when the date rolled over.
  const rows = await db
    .select({
      bidCpc: adCampaigns.bidCpc,
      dailySpend: adCampaigns.dailySpend,
      dailySpendDate: adCampaigns.dailySpendDate,
    })
    .from(adCampaigns)
    .where(eq(adCampaigns.id, adId))
    .limit(1);
  if (rows.length === 0) return;

  const bid = rows[0].bidCpc ?? 0;
  const lastDate = toIsoDate(rows[0].dailySpendDate);
  const today = new Date().toISOString().slice(0, 10);
  const newSpend = lastDate === today ? (rows[0].dailySpend ?? 0) + bid : bid;

  await db
    .update(adCampaigns)
    .set({
      clicks: sql`${adCampaigns.clicks} + 1`,
      totalSpentCents: sql`${adCampaigns.totalSpentCents} + CAST(${adCampaigns.bidCpc} * 100 AS UNSIGNED)`,
      dailySpend: newSpend,
      dailySpendDate: new Date(),
    })
    .where(eq(adCampaigns.id, adId));

  const campaign = await db.select({
    brandId: adCampaigns.brandId,
    bidCpc: adCampaigns.bidCpc,
  })
    .from(adCampaigns)
    .where(eq(adCampaigns.id, adId))
    .limit(1);
  const spendCents = Math.round((campaign[0]?.bidCpc ?? 0) * 100);
  await bumpCampaignMetric({
    campaignId: adId,
    brandId: campaign[0]?.brandId ?? null,
    clicks: 1,
    spendCents,
  });
}

/**
 * Picks campaigns matching the viewer's shopper profile for a given surface.
 *
 * Matching is best-effort permissive: if the campaign omits a targeting facet
 * (e.g. no `targetTiers`), that facet always passes. Tie-break by `bidCpc DESC`
 * so the marketplace rewards the higher bidder when multiple campaigns match.
 *
 * @param surface  which physical slot (dashboard_promo, sponsored_search, ...)
 * @param userArg  the request's user (null for anonymous — only fully-open campaigns match)
 * @param limit    max number of placements to return
 * @param keywords optional — for `sponsored_search`, the user's query terms
 */
export async function getEligibleCampaigns(
  surface: string,
  userArg: User | null,
  limit = 1,
  keywords: string[] = []
) {
  const db = await getDb();
  if (!db) return [];
  const all = await db
    .select()
    .from(adCampaigns)
    .where(and(eq(adCampaigns.type, surface as any), eq(adCampaigns.isActive, true)));

  const now = new Date();
  const profile = userArg?.preferences?.shopperProfile ?? null;
  const userTier = profile?.priceTier ?? null;
  const userChains = new Set(profile?.preferredChains ?? []);
  const userBasket = new Set(profile?.basketMix ?? []);
  const userCadence = profile?.shoppingCadence ?? null;
  const userHousehold = profile?.householdSize ?? null;
  const householdRank: Record<string, number> = {
    "1": 1,
    "2": 2,
    "3-4": 3,
    "5+": 4,
  };

  const lowerKeywords = keywords.map((k) => k.toLowerCase());
  const today = new Date().toISOString().slice(0, 10);

  // Pre-filter by everything that doesn't need an extra DB query (targeting + dates + budget).
  const targetingMatches = all.filter((c) => {
    if (c.activeFrom && new Date(c.activeFrom) > now) return false;
    if (c.activeUntil && new Date(c.activeUntil) < now) return false;

    // Daily budget enforcement: if the campaign has a daily budget AND we've
    // already spent it today (no rollover), skip. Crossing the date boundary
    // implicitly resets — recordAdClick handles the reset on click.
    if (c.dailyBudget != null && c.dailyBudget > 0) {
      const lastDate = toIsoDate(c.dailySpendDate);
      const todaysSpend = lastDate === today ? (c.dailySpend ?? 0) : 0;
      if (todaysSpend >= c.dailyBudget) return false;
    }

    if (c.targetTiers && c.targetTiers.length > 0) {
      if (!userTier || !c.targetTiers.includes(userTier)) return false;
    }
    if (c.targetChains && c.targetChains.length > 0) {
      const overlap = c.targetChains.some((ch) => userChains.has(ch as any));
      if (!overlap) return false;
    }
    if (c.targetBasketMix && c.targetBasketMix.length > 0) {
      const overlap = c.targetBasketMix.some((b) => userBasket.has(b as any));
      if (!overlap) return false;
    }
    if (c.targetCadences && c.targetCadences.length > 0) {
      if (!userCadence || !c.targetCadences.includes(userCadence)) return false;
    }
    if (c.targetMinHouseholdSize) {
      const min = householdRank[c.targetMinHouseholdSize] ?? 1;
      const usr = userHousehold ? householdRank[userHousehold] ?? 1 : 0;
      if (usr < min) return false;
    }
    if (c.targetKeywords && c.targetKeywords.length > 0) {
      const overlap = c.targetKeywords.some((kw) =>
        lowerKeywords.some((uk) => uk.includes(kw.toLowerCase()))
      );
      if (!overlap) return false;
    }
    return true;
  });

  // Frequency capping: skip campaigns this user has already seen too many
  // times today. Single round-trip per call — we count impressions for the
  // remaining candidates in batch.
  let cappedCampaignIds: Set<number> = new Set();
  const userId = userArg?.id;
  if (userId && targetingMatches.length > 0) {
    const candidateIds = targetingMatches.map((c) => c.id);
    const idsCsv = candidateIds.join(",");
    const result = await db.execute(sql`
      SELECT JSON_EXTRACT(properties, '$.campaignId') AS campaignId,
             COUNT(*) AS impressions
      FROM analytics_events
      WHERE eventName = 'campaign_impression'
        AND userId = ${userId}
        AND JSON_EXTRACT(properties, '$.campaignId') IN (${sql.raw(idsCsv)})
        AND createdAt >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      GROUP BY campaignId
    `);
    const unwrap = <T>(r: unknown): T[] => {
      if (Array.isArray(r)) {
        const first = (r as unknown[])[0];
        if (Array.isArray(first)) return first as T[];
        if (
          first &&
          typeof first === "object" &&
          !("affectedRows" in (first as object))
        ) {
          return r as T[];
        }
      }
      if (r && typeof r === "object" && "rows" in (r as object)) {
        return ((r as { rows?: T[] }).rows ?? []) as T[];
      }
      return [];
    };
    const counts = unwrap<{ campaignId: number; impressions: number | string }>(
      result
    );
    cappedCampaignIds = new Set(
      counts
        .filter((r) => {
          const c = targetingMatches.find((t) => t.id === Number(r.campaignId));
          const cap = c?.maxImpressionsPerUserPerDay ?? 5;
          return Number(r.impressions) >= cap;
        })
        .map((r) => Number(r.campaignId))
    );
  }

  const matches = targetingMatches.filter((c) => !cappedCampaignIds.has(c.id));
  matches.sort((a, b) => (b.bidCpc ?? 0) - (a.bidCpc ?? 0));
  return matches.slice(0, limit);
}

/**
 * Per-campaign performance for the admin dashboard. Uses the counters on
 * ad_campaigns directly — analytics_events has the same data with richer
 * facets but for now we keep this simple.
 */
export async function getCampaignPerformance() {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      id: adCampaigns.id,
      sponsor: adCampaigns.sponsor,
      type: adCampaigns.type,
      title: adCampaigns.title,
      bidCpc: adCampaigns.bidCpc,
      impressions: adCampaigns.impressions,
      clicks: adCampaigns.clicks,
      isActive: adCampaigns.isActive,
      activeFrom: adCampaigns.activeFrom,
      activeUntil: adCampaigns.activeUntil,
      createdAt: adCampaigns.createdAt,
    })
    .from(adCampaigns)
    .orderBy(desc(adCampaigns.isActive), desc(adCampaigns.clicks));

  return rows.map((r) => {
    const imp = r.impressions ?? 0;
    const clk = r.clicks ?? 0;
    const ctr = imp > 0 ? (clk / imp) * 100 : 0;
    return {
      ...r,
      ctr: Math.round(ctr * 100) / 100,
      estSpend: Math.round(clk * (r.bidCpc ?? 0) * 100) / 100,
    };
  });
}

// ============ GAMIFICATION HELPERS ============
export async function getLeaderboard(period: "weekly" | "monthly" | "alltime", limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    userId: leaderboard.userId,
    points: leaderboard.points,
    rank: leaderboard.rank,
    priceReports: leaderboard.priceReports,
    userName: users.name,
    trustScore: users.trustScore,
  })
    .from(leaderboard)
    .innerJoin(users, eq(leaderboard.userId, users.id))
    .where(eq(leaderboard.period, period))
    .orderBy(asc(leaderboard.rank))
    .limit(limit);
}

export async function getUserRank(userId: number, period: "weekly" | "monthly" | "alltime") {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(leaderboard)
    .where(and(eq(leaderboard.userId, userId), eq(leaderboard.period, period)))
    .limit(1);
  return result[0];
}

export async function getAchievements() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(achievements).orderBy(asc(achievements.pointsRequired));
}

export async function getUserAchievements(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    achievementId: userAchievements.achievementId,
    earnedAt: userAchievements.earnedAt,
    name: achievements.name,
    description: achievements.description,
    iconUrl: achievements.iconUrl,
    badgeType: achievements.badgeType,
  })
    .from(userAchievements)
    .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
    .where(eq(userAchievements.userId, userId));
}

export async function awardAchievement(userId: number, achievementId: number) {
  const db = await getDb();
  if (!db) return;
  await db.insert(userAchievements).values({ userId, achievementId }).onDuplicateKeyUpdate({
    set: { earnedAt: new Date() }
  });
}

// ============ PRICE VOTE HELPERS ============
export async function addPriceVote(priceEntryId: number, userId: number, voteType: "confirm" | "dispute") {
  const db = await getDb();
  if (!db) return;
  await db.insert(priceVotes).values({ priceEntryId, userId, voteType });
  if (voteType === "confirm") {
    await incrementPriceVote(priceEntryId);
  }
}

export async function getUserVoteForPrice(priceEntryId: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(priceVotes)
    .where(and(eq(priceVotes.priceEntryId, priceEntryId), eq(priceVotes.userId, userId)))
    .limit(1);
  return result[0];
}

// ============ RECIPE HELPERS ============
export async function saveRecipe(recipe: InsertSavedRecipe) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(savedRecipes).values(recipe);
  return result[0]?.insertId ?? null;
}

export async function getUserRecipes(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(savedRecipes)
    .where(eq(savedRecipes.userId, userId))
    .orderBy(desc(savedRecipes.createdAt));
}

export async function getRecipeById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(savedRecipes).where(eq(savedRecipes.id, id)).limit(1);
  return result[0];
}

export async function deleteRecipe(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(savedRecipes).where(eq(savedRecipes.id, id));
}

// ============ BUDGET HELPERS ============
export interface BudgetSettings {
  monthlyBudget: number;
  budgetAlertThreshold: number;
  budgetCycleStartDay: number;
}

export async function getUserBudget(userId: number): Promise<BudgetSettings | null> {
  const user = await getUserById(userId);
  if (!user || !user.preferences?.monthlyBudget) return null;
  return {
    monthlyBudget: user.preferences.monthlyBudget,
    budgetAlertThreshold: user.preferences.budgetAlertThreshold ?? 0.8,
    budgetCycleStartDay: user.preferences.budgetCycleStartDay ?? 1,
  };
}

export async function setUserBudget(userId: number, budget: BudgetSettings) {
  const db = await getDb();
  if (!db) return;
  const user = await getUserById(userId);
  const existing = user?.preferences ?? {};
  await db.update(users).set({
    preferences: {
      ...existing,
      monthlyBudget: budget.monthlyBudget,
      budgetAlertThreshold: budget.budgetAlertThreshold,
      budgetCycleStartDay: budget.budgetCycleStartDay,
    },
  }).where(eq(users.id, userId));
}

export async function clearUserBudget(userId: number) {
  const db = await getDb();
  if (!db) return;
  const user = await getUserById(userId);
  if (!user?.preferences) return;
  const {
    monthlyBudget: _mb,
    budgetAlertThreshold: _bat,
    budgetCycleStartDay: _bcsd,
    ...rest
  } = user.preferences;
  await db.update(users).set({ preferences: rest }).where(eq(users.id, userId));
}

function getCycleStart(cycleStartDay: number): Date {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), cycleStartDay, 0, 0, 0, 0);
  if (start > now) {
    start.setMonth(start.getMonth() - 1);
  }
  return start;
}

export async function getSpendingSinceCycleStart(userId: number, cycleStartDay: number) {
  const db = await getDb();
  if (!db) return { total: 0, transactionCount: 0 };
  const since = getCycleStart(cycleStartDay);
  const result = await db.select({
    total: sql<number>`COALESCE(SUM(${purchaseHistory.price} * ${purchaseHistory.quantity}), 0)`,
    transactionCount: sql<number>`COUNT(*)`,
  })
    .from(purchaseHistory)
    .where(and(
      eq(purchaseHistory.userId, userId),
      gte(purchaseHistory.purchasedAt, since),
      sql`${purchaseHistory.price} IS NOT NULL`
    ));
  return {
    total: Number(result[0]?.total ?? 0),
    transactionCount: Number(result[0]?.transactionCount ?? 0),
  };
}

export async function getSpendingByCategory(userId: number, cycleStartDay: number) {
  const db = await getDb();
  if (!db) return [];
  const since = getCycleStart(cycleStartDay);
  return db.select({
    category: products.category,
    spent: sql<number>`COALESCE(SUM(${purchaseHistory.price} * ${purchaseHistory.quantity}), 0)`,
    itemCount: sql<number>`COUNT(*)`,
  })
    .from(purchaseHistory)
    .innerJoin(products, eq(purchaseHistory.productId, products.id))
    .where(and(
      eq(purchaseHistory.userId, userId),
      gte(purchaseHistory.purchasedAt, since),
      sql`${purchaseHistory.price} IS NOT NULL`
    ))
    .groupBy(products.category)
    .orderBy(desc(sql`SUM(${purchaseHistory.price} * ${purchaseHistory.quantity})`));
}

export async function getSpendingByStore(userId: number, cycleStartDay: number) {
  const db = await getDb();
  if (!db) return [];
  const since = getCycleStart(cycleStartDay);
  return db.select({
    storeId: purchaseHistory.storeId,
    storeName: stores.name,
    spent: sql<number>`COALESCE(SUM(${purchaseHistory.price} * ${purchaseHistory.quantity}), 0)`,
    visitCount: sql<number>`COUNT(DISTINCT DATE(${purchaseHistory.purchasedAt}))`,
  })
    .from(purchaseHistory)
    .leftJoin(stores, eq(purchaseHistory.storeId, stores.id))
    .where(and(
      eq(purchaseHistory.userId, userId),
      gte(purchaseHistory.purchasedAt, since),
      sql`${purchaseHistory.price} IS NOT NULL`,
      sql`${purchaseHistory.storeId} IS NOT NULL`
    ))
    .groupBy(purchaseHistory.storeId, stores.name)
    .orderBy(desc(sql`SUM(${purchaseHistory.price} * ${purchaseHistory.quantity})`));
}

export async function getDailySpendingTrend(userId: number, cycleStartDay: number) {
  const db = await getDb();
  if (!db) return [];
  const since = getCycleStart(cycleStartDay);
  return db.select({
    day: sql<string>`DATE(${purchaseHistory.purchasedAt})`,
    spent: sql<number>`COALESCE(SUM(${purchaseHistory.price} * ${purchaseHistory.quantity}), 0)`,
  })
    .from(purchaseHistory)
    .where(and(
      eq(purchaseHistory.userId, userId),
      gte(purchaseHistory.purchasedAt, since),
      sql`${purchaseHistory.price} IS NOT NULL`
    ))
    .groupBy(sql`DATE(${purchaseHistory.purchasedAt})`)
    .orderBy(asc(sql`DATE(${purchaseHistory.purchasedAt})`));
}

// ============ SEASONAL DEAL HELPERS ============
export async function getMonthlyAveragePrices(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    month: sql<number>`MONTH(${priceHistory.recordedAt})`,
    avgPrice: sql<number>`AVG(${priceHistory.price})`,
    minPrice: sql<number>`MIN(${priceHistory.price})`,
    sampleCount: sql<number>`COUNT(*)`,
  })
    .from(priceHistory)
    .where(eq(priceHistory.productId, productId))
    .groupBy(sql`MONTH(${priceHistory.recordedAt})`)
    .orderBy(asc(sql`MONTH(${priceHistory.recordedAt})`));
}

export async function getCurrentLowestPrice(productId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select({
    minPrice: sql<number>`MIN(${priceEntries.price})`,
  })
    .from(priceEntries)
    .where(and(
      eq(priceEntries.productId, productId),
      eq(priceEntries.isOutlier, false),
      gte(priceEntries.createdAt, sql`DATE_SUB(NOW(), INTERVAL 30 DAY)`)
    ));
  const val = result[0]?.minPrice;
  return val !== undefined && val !== null ? Number(val) : null;
}

export async function getTrackedProductsForUser(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    productId: purchaseHistory.productId,
    productName: products.name,
    category: products.category,
    purchaseCount: sql<number>`COUNT(*)`,
  })
    .from(purchaseHistory)
    .innerJoin(products, eq(purchaseHistory.productId, products.id))
    .where(eq(purchaseHistory.userId, userId))
    .groupBy(purchaseHistory.productId, products.name, products.category)
    .orderBy(desc(sql`COUNT(*)`))
    .limit(limit);
}

export async function getPopularProductsForSeasonal(limit = 30) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    productId: products.id,
    productName: products.name,
    category: products.category,
    priceCount: sql<number>`COUNT(${priceHistory.id})`,
  })
    .from(products)
    .innerJoin(priceHistory, eq(priceHistory.productId, products.id))
    .groupBy(products.id, products.name, products.category)
    .having(sql`COUNT(${priceHistory.id}) >= 3`)
    .orderBy(desc(sql`COUNT(${priceHistory.id})`))
    .limit(limit);
}


// ============ PRICE ALERTS HELPERS ============
export async function createPriceAlert(alert: InsertPriceAlert) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(priceAlerts).values(alert);
  return result[0]?.insertId ?? null;
}

export async function getUserPriceAlerts(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: priceAlerts.id,
    productId: priceAlerts.productId,
    targetPrice: priceAlerts.targetPrice,
    currentLowestPrice: priceAlerts.currentLowestPrice,
    currentLowestStoreId: priceAlerts.currentLowestStoreId,
    isActive: priceAlerts.isActive,
    lastNotifiedAt: priceAlerts.lastNotifiedAt,
    notificationCount: priceAlerts.notificationCount,
    createdAt: priceAlerts.createdAt,
    productName: products.name,
    productBrand: products.brand,
    productImageUrl: products.imageUrl,
    storeName: stores.name,
  })
    .from(priceAlerts)
    .innerJoin(products, eq(priceAlerts.productId, products.id))
    .leftJoin(stores, eq(priceAlerts.currentLowestStoreId, stores.id))
    .where(eq(priceAlerts.userId, userId))
    .orderBy(desc(priceAlerts.createdAt));
}

export async function updatePriceAlert(id: number, data: Partial<InsertPriceAlert>) {
  const db = await getDb();
  if (!db) return;
  await db.update(priceAlerts).set(data).where(eq(priceAlerts.id, id));
}

export async function deletePriceAlert(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(priceAlerts).where(eq(priceAlerts.id, id));
}

export async function getActiveAlertsForProduct(productId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: priceAlerts.id,
    userId: priceAlerts.userId,
    targetPrice: priceAlerts.targetPrice,
    currentLowestPrice: priceAlerts.currentLowestPrice,
    lastNotifiedAt: priceAlerts.lastNotifiedAt,
  })
    .from(priceAlerts)
    .where(and(
      eq(priceAlerts.productId, productId),
      eq(priceAlerts.isActive, true)
    ));
}

export async function markAlertNotified(alertId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(priceAlerts).set({
    lastNotifiedAt: new Date(),
    notificationCount: sql`${priceAlerts.notificationCount} + 1`,
  }).where(eq(priceAlerts.id, alertId));
}

// ============ STORE CROWDEDNESS HELPERS ============
export async function reportStoreCrowdedness(report: InsertStoreCrowdedness) {
  const db = await getDb();
  if (!db) return null;
  // Set expiration to 30 minutes from now
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  const result = await db.insert(storeCrowdedness).values({
    ...report,
    expiresAt,
  });
  return result[0]?.insertId ?? null;
}

export async function getStoreCrowdedness(storeId: number) {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  // Get the most recent non-expired report
  const result = await db.select()
    .from(storeCrowdedness)
    .where(and(
      eq(storeCrowdedness.storeId, storeId),
      or(
        gte(storeCrowdedness.expiresAt, now),
        sql`${storeCrowdedness.expiresAt} IS NULL`
      )
    ))
    .orderBy(desc(storeCrowdedness.reportedAt))
    .limit(1);
  return result[0];
}

export async function getRecentCrowdednessReports(storeId: number, hours = 24) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return db.select({
    id: storeCrowdedness.id,
    crowdednessLevel: storeCrowdedness.crowdednessLevel,
    reportSource: storeCrowdedness.reportSource,
    waitTimeMinutes: storeCrowdedness.waitTimeMinutes,
    comment: storeCrowdedness.comment,
    reportedAt: storeCrowdedness.reportedAt,
    userName: users.name,
  })
    .from(storeCrowdedness)
    .leftJoin(users, eq(storeCrowdedness.userId, users.id))
    .where(and(
      eq(storeCrowdedness.storeId, storeId),
      gte(storeCrowdedness.reportedAt, since)
    ))
    .orderBy(desc(storeCrowdedness.reportedAt));
}

export async function getAverageCrowdedness(storeId: number) {
  const db = await getDb();
  if (!db) return null;
  const now = new Date();
  const result = await db.select({
    avgLevel: sql<number>`AVG(${storeCrowdedness.crowdednessLevel})`,
    reportCount: sql<number>`COUNT(*)`,
  })
    .from(storeCrowdedness)
    .where(and(
      eq(storeCrowdedness.storeId, storeId),
      or(
        gte(storeCrowdedness.expiresAt, now),
        sql`${storeCrowdedness.expiresAt} IS NULL`
      )
    ));
  return result[0];
}

// ============ GOOGLE PLACES CACHE HELPERS ============
export async function cacheGooglePlace(place: InsertGooglePlaceCache) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(googlePlacesCache).values(place).onDuplicateKeyUpdate({
    set: {
      name: place.name,
      address: place.address,
      latitude: place.latitude,
      longitude: place.longitude,
      rating: place.rating,
      userRatingsTotal: place.userRatingsTotal,
      priceLevel: place.priceLevel,
      types: place.types,
      phone: place.phone,
      website: place.website,
      openNow: place.openNow,
      lastFetchedAt: new Date(),
    }
  });
  return result[0]?.insertId ?? null;
}

export async function getGooglePlaceByPlaceId(placeId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(googlePlacesCache)
    .where(eq(googlePlacesCache.placeId, placeId))
    .limit(1);
  return result[0];
}

export async function getNearbyGooglePlaces(latitude: number, longitude: number, radiusKm: number) {
  const db = await getDb();
  if (!db) return [];
  // Simple bounding box query
  const latDelta = radiusKm / 111;
  const lngDelta = radiusKm / (111 * Math.cos(latitude * Math.PI / 180));
  
  return db.select()
    .from(googlePlacesCache)
    .where(and(
      gte(googlePlacesCache.latitude, latitude - latDelta),
      lte(googlePlacesCache.latitude, latitude + latDelta),
      gte(googlePlacesCache.longitude, longitude - lngDelta),
      lte(googlePlacesCache.longitude, longitude + lngDelta)
    ))
    .orderBy(desc(googlePlacesCache.rating));
}

export async function linkGooglePlaceToStore(placeId: string, storeId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(googlePlacesCache)
    .set({ storeId })
    .where(eq(googlePlacesCache.placeId, placeId));
}

export async function importGooglePlaceAsStore(placeId: string): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  
  const cached = await getGooglePlaceByPlaceId(placeId);
  if (!cached) return null;
  
  // Check if already linked
  if (cached.storeId) return cached.storeId;
  
  // Create new store from cached data
  const storeId = await createStore({
    name: cached.name,
    address: cached.address || undefined,
    latitude: cached.latitude,
    longitude: cached.longitude,
    phone: cached.phone || undefined,
    avgRating: cached.rating || undefined,
    totalRatings: cached.userRatingsTotal || undefined,
  });
  
  if (storeId) {
    await linkGooglePlaceToStore(placeId, storeId);
  }

  return storeId;
}

// ============ BRAND HELPERS ============
export async function createBrand(data: InsertBrand): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(brands).values(data);
  return result[0].insertId ?? null;
}

export async function getBrandById(id: number): Promise<Brand | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(brands).where(eq(brands.id, id)).limit(1);
  return result[0];
}

export async function getBrandByEmail(email: string): Promise<Brand | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const normalized = email.trim().toLowerCase();
  const result = await db.select().from(brands).where(eq(brands.email, normalized)).limit(1);
  return result[0];
}

export async function updateBrand(
  id: number,
  patch: Partial<InsertBrand>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (Object.keys(patch).length === 0) return;
  await db.update(brands).set(patch).where(eq(brands.id, id));
}

export async function markBrandVerified(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(brands)
    .set({ emailVerified: true, status: "active" })
    .where(eq(brands.id, id));
}

export async function recordBrandSignIn(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(brands).set({ lastSignedIn: new Date() }).where(eq(brands.id, id));
}

// ============ BRAND TOKEN HELPERS ============
export async function createBrandToken(data: InsertBrandToken): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(brandTokens).values(data);
}

export async function getBrandToken(token: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(brandTokens).where(eq(brandTokens.token, token)).limit(1);
  return result[0];
}

export async function markBrandTokenUsed(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(brandTokens).set({ usedAt: new Date() }).where(eq(brandTokens.id, id));
}

export async function invalidateBrandTokensOfType(
  brandId: number,
  type: "email_verify" | "password_reset"
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(brandTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(brandTokens.brandId, brandId),
      eq(brandTokens.type, type),
      isNull(brandTokens.usedAt),
    ));
}

// ============ ANALYTICS (from redesign) ============

interface RecordAnalyticsInput {
  eventName: string;
  user?: User | null;
  sessionId?: string | null;
  properties?: AnalyticsProperties;
}

/**
 * Fire-and-forget event insert. Never throws — analytics failure must never
 * break a user-facing request. Denormalizes tier/cadence/householdSize from
 * the user's shopper profile so dashboards aggregate without JOINs.
 */
export async function recordAnalyticsEvent(
  input: RecordAnalyticsInput
): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const profile = input.user?.preferences?.shopperProfile;
    const payload: InsertAnalyticsEvent = {
      userId: input.user?.id ?? null,
      sessionId: input.sessionId ?? null,
      eventName: input.eventName,
      properties: input.properties ?? {},
      tier: profile?.priceTier ?? null,
      cadence: profile?.shoppingCadence ?? null,
      householdSize: profile?.householdSize ?? null,
    };
    await db.insert(analyticsEvents).values(payload);
  } catch (error) {
    console.warn("[Analytics] Failed to record event:", error);
  }
}

function unwrapRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    const first = (result as unknown[])[0];
    if (Array.isArray(first)) return first as T[];
    if (first && typeof first === "object" && !("affectedRows" in (first as object))) {
      return result as T[];
    }
  }
  if (result && typeof result === "object" && "rows" in (result as object)) {
    return ((result as { rows?: T[] }).rows ?? []) as T[];
  }
  return [];
}

export async function getAnalyticsSummary(days = 7) {
  const db = await getDb();
  if (!db) {
    return {
      days,
      totalEvents: 0,
      byTier: [] as Array<{ tier: string; count: number }>,
      byEvent: [] as Array<{ eventName: string; count: number }>,
      topQueries: [] as Array<{ query: string; count: number }>,
      onboardingFunnel: { started: 0, completed: 0, skipped: 0 },
    };
  }

  const tierRaw = await db.execute(sql`
    SELECT JSON_UNQUOTE(JSON_EXTRACT(preferences, '$.shopperProfile.priceTier')) AS tier,
           COUNT(*) AS count
    FROM users
    WHERE JSON_EXTRACT(preferences, '$.shopperProfile.priceTier') IS NOT NULL
    GROUP BY tier
    ORDER BY count DESC
  `);
  const eventRaw = await db.execute(sql`
    SELECT eventName, COUNT(*) AS count
    FROM analytics_events
    WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(days))} DAY)
    GROUP BY eventName
    ORDER BY count DESC
    LIMIT 30
  `);
  const totalRaw = await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM analytics_events
    WHERE createdAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(days))} DAY)
  `);
  const queryRaw = await db.execute(sql`
    SELECT LOWER(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.query'))) AS query,
           COUNT(*) AS count
    FROM analytics_events
    WHERE eventName = 'product_search'
      AND createdAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(days))} DAY)
      AND JSON_EXTRACT(properties, '$.query') IS NOT NULL
    GROUP BY query
    ORDER BY count DESC
    LIMIT 10
  `);
  const funnelRaw = await db.execute(sql`
    SELECT eventName, COUNT(*) AS count
    FROM analytics_events
    WHERE eventName IN ('onboarding_started','onboarding_skipped','onboarding_completed')
      AND createdAt >= DATE_SUB(NOW(), INTERVAL ${sql.raw(String(days))} DAY)
    GROUP BY eventName
  `);

  type TierRow = { tier: string | null; count: number | string };
  type EventRow = { eventName: string | null; count: number | string };
  type TotalRow = { total: number | string };
  type QueryRow = { query: string | null; count: number | string };

  const tiers = unwrapRows<TierRow>(tierRaw);
  const events = unwrapRows<EventRow>(eventRaw);
  const totals = unwrapRows<TotalRow>(totalRaw);
  const queries = unwrapRows<QueryRow>(queryRaw);
  const funnel = unwrapRows<EventRow>(funnelRaw);

  const funnelMap = Object.fromEntries(
    funnel.map((r) => [r.eventName ?? "", Number(r.count)])
  );

  return {
    days,
    totalEvents: Number(totals[0]?.total ?? 0),
    byTier: tiers.map((r) => ({ tier: r.tier ?? "unknown", count: Number(r.count) })),
    byEvent: events
      .filter((r) => r.eventName)
      .map((r) => ({ eventName: r.eventName as string, count: Number(r.count) })),
    topQueries: queries.map((r) => ({ query: r.query ?? "(empty)", count: Number(r.count) })),
    onboardingFunnel: {
      started: funnelMap["onboarding_started"] ?? 0,
      completed: funnelMap["onboarding_completed"] ?? 0,
      skipped: funnelMap["onboarding_skipped"] ?? 0,
    },
  };
}

// ============ BRAND CAMPAIGN HELPERS ============
export async function listCampaignsForBrand(brandId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(adCampaigns)
    .where(eq(adCampaigns.brandId, brandId))
    .orderBy(desc(adCampaigns.createdAt));
}

// Note: brand/createBrand/getBrandById/getBrandByEmail helpers are defined
// earlier in this file (c02ee38 implementation, more complete). The redesign
// had stub versions using slug/ownerEmail fields that don't exist in our schema.

export async function getCampaignForBrand(brandId: number, campaignId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select()
    .from(adCampaigns)
    .where(and(eq(adCampaigns.id, campaignId), eq(adCampaigns.brandId, brandId)))
    .limit(1);
  return result[0];
}

export async function createCampaign(data: InsertAdCampaign): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(adCampaigns).values(data);
  return result[0].insertId ?? null;
}

export async function updateCampaignForBrand(
  brandId: number,
  campaignId: number,
  patch: Partial<InsertAdCampaign>
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (Object.keys(patch).length === 0) return;
  await db.update(adCampaigns)
    .set(patch)
    .where(and(eq(adCampaigns.id, campaignId), eq(adCampaigns.brandId, brandId)));
}

export async function deleteCampaignForBrand(brandId: number, campaignId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.delete(adCampaigns)
    .where(and(eq(adCampaigns.id, campaignId), eq(adCampaigns.brandId, brandId)));
}

// ============ CAMPAIGN METRICS HELPERS ============
function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function periodKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

export async function bumpCampaignMetric(opts: {
  campaignId: number;
  brandId: number | null;
  impressions?: number;
  clicks?: number;
  spendCents?: number;
  day?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const day = opts.day ?? todayKey();
  const impressions = opts.impressions ?? 0;
  const clicks = opts.clicks ?? 0;
  const spendCents = opts.spendCents ?? 0;

  await db.insert(campaignMetrics)
    .values({
      campaignId: opts.campaignId,
      brandId: opts.brandId,
      day,
      impressions,
      clicks,
      spendCents,
    })
    .onDuplicateKeyUpdate({
      set: {
        impressions: sql`${campaignMetrics.impressions} + ${impressions}`,
        clicks: sql`${campaignMetrics.clicks} + ${clicks}`,
        spendCents: sql`${campaignMetrics.spendCents} + ${spendCents}`,
      },
    });
}

export async function getCampaignMetricsTimeseries(opts: {
  campaignId: number;
  brandId: number;
  fromDay: string;
  toDay: string;
}) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(campaignMetrics)
    .where(and(
      eq(campaignMetrics.campaignId, opts.campaignId),
      eq(campaignMetrics.brandId, opts.brandId),
      gte(campaignMetrics.day, opts.fromDay),
      lte(campaignMetrics.day, opts.toDay),
    ))
    .orderBy(asc(campaignMetrics.day));
}

export async function getBrandSpendByPeriod(opts: {
  brandId: number;
  periodMonth: string; // YYYY-MM
}) {
  const db = await getDb();
  if (!db) return [];
  const dayPrefix = `${opts.periodMonth}-`;
  return db.select({
    campaignId: campaignMetrics.campaignId,
    impressions: sql<number>`SUM(${campaignMetrics.impressions})`,
    clicks: sql<number>`SUM(${campaignMetrics.clicks})`,
    spendCents: sql<number>`SUM(${campaignMetrics.spendCents})`,
  })
    .from(campaignMetrics)
    .where(and(
      eq(campaignMetrics.brandId, opts.brandId),
      like(campaignMetrics.day, `${dayPrefix}%`),
    ))
    .groupBy(campaignMetrics.campaignId);
}

// ============ INVOICE HELPERS ============
export async function listInvoicesForBrand(brandId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(invoices)
    .where(eq(invoices.brandId, brandId))
    .orderBy(desc(invoices.periodMonth));
}

export async function getInvoiceForBrand(brandId: number, invoiceId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select()
    .from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.brandId, brandId)))
    .limit(1);
  return result[0];
}

export async function getInvoiceForBrandByPeriod(brandId: number, periodMonth: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select()
    .from(invoices)
    .where(and(eq(invoices.brandId, brandId), eq(invoices.periodMonth, periodMonth)))
    .limit(1);
  return result[0];
}

export async function listInvoiceLineItems(invoiceId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId))
    .orderBy(asc(invoiceLineItems.id));
}

export async function createInvoice(data: InsertInvoice): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(invoices).values(data);
  return result[0].insertId ?? null;
}

export async function createInvoiceLineItems(items: InsertInvoiceLineItem[]): Promise<void> {
  if (items.length === 0) return;
  const db = await getDb();
  if (!db) return;
  await db.insert(invoiceLineItems).values(items);
}

export async function updateInvoice(invoiceId: number, patch: Partial<InsertInvoice>): Promise<void> {
  const db = await getDb();
  if (!db) return;
  if (Object.keys(patch).length === 0) return;
  await db.update(invoices).set(patch).where(eq(invoices.id, invoiceId));
}

export function currentPeriodMonth(date: Date = new Date()): string {
  return periodKey(date);
}

export function currentDayKey(date: Date = new Date()): string {
  return todayKey(date);
}

// ============ BRAND INSIGHTS (Fase 4, from redesign) ============

/**
 * Aggregate intelligence dashboard for a single brand. Powers
 * /brand/insights. Returns:
 *   - audience composition (tier / household / cadence breakdown of users
 *     who saw any of this brand's campaigns)
 *   - 30-day daily trend (impressions, clicks)
 *   - top product_search queries in this brand's target tiers
 *   - tier gap: how many users per tier exist vs how many you've reached
 *
 * Pure read-only — never writes to the DB. Safe to call as a tab refresh.
 */
export async function getBrandInsights(brandId: number) {
  const db = await getDb();
  if (!db) {
    return {
      windowDays: 30,
      campaignIds: [],
      reach: 0,
      audienceByTier: [],
      audienceByHousehold: [],
      audienceByCadence: [],
      dailyTrend: [],
      topQueries: [],
      tierGap: [],
      chainAffinity: [],
    };
  }

  // 1. Collect this brand's campaign IDs and target tiers.
  const myCampaigns = await db
    .select({
      id: adCampaigns.id,
      targetTiers: adCampaigns.targetTiers,
    })
    .from(adCampaigns)
    .where(eq(adCampaigns.brandId, brandId));

  const campaignIds = myCampaigns.map((c) => c.id);
  const targetTierSet = new Set<string>();
  for (const c of myCampaigns) {
    for (const t of (c.targetTiers as string[] | null) ?? []) {
      targetTierSet.add(t);
    }
  }
  const targetTiers = Array.from(targetTierSet);

  // No campaigns yet → return empty shape so the UI renders the empty state.
  if (campaignIds.length === 0) {
    return {
      windowDays: 30,
      campaignIds,
      reach: 0,
      audienceByTier: [],
      audienceByHousehold: [],
      audienceByCadence: [],
      dailyTrend: [],
      topQueries: [],
      tierGap: [],
      chainAffinity: [],
    };
  }

  const campaignIdsCsv = campaignIds.join(",");

  // Helper to unwrap mysql2 execute() results.
  const unwrap = <T>(result: unknown): T[] => {
    if (Array.isArray(result)) {
      const first = (result as unknown[])[0];
      if (Array.isArray(first)) return first as T[];
      if (
        first &&
        typeof first === "object" &&
        !("affectedRows" in (first as object))
      ) {
        return result as T[];
      }
    }
    if (result && typeof result === "object" && "rows" in (result as object)) {
      return ((result as { rows?: T[] }).rows ?? []) as T[];
    }
    return [];
  };

  // 2. Total reach (unique users with at least one impression).
  const reachRaw = await db.execute(sql`
    SELECT COUNT(DISTINCT userId) AS reach
    FROM analytics_events
    WHERE eventName = 'campaign_impression'
      AND JSON_EXTRACT(properties, '$.campaignId') IN (${sql.raw(campaignIdsCsv)})
      AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
  `);
  const reachRows = unwrap<{ reach: number | string | null }>(reachRaw);
  const reach = Number(reachRows[0]?.reach ?? 0);

  // 3. Audience by tier (denormalized — no JOIN with users needed).
  const tierRaw = await db.execute(sql`
    SELECT tier,
           COUNT(DISTINCT userId) AS users,
           COUNT(*) AS impressions
    FROM analytics_events
    WHERE eventName = 'campaign_impression'
      AND JSON_EXTRACT(properties, '$.campaignId') IN (${sql.raw(campaignIdsCsv)})
      AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY tier
    ORDER BY impressions DESC
  `);

  // 4. Audience by household size.
  const householdRaw = await db.execute(sql`
    SELECT householdSize AS bucket,
           COUNT(DISTINCT userId) AS users,
           COUNT(*) AS impressions
    FROM analytics_events
    WHERE eventName = 'campaign_impression'
      AND JSON_EXTRACT(properties, '$.campaignId') IN (${sql.raw(campaignIdsCsv)})
      AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY householdSize
    ORDER BY impressions DESC
  `);

  // 5. Audience by cadence.
  const cadenceRaw = await db.execute(sql`
    SELECT cadence AS bucket,
           COUNT(DISTINCT userId) AS users,
           COUNT(*) AS impressions
    FROM analytics_events
    WHERE eventName = 'campaign_impression'
      AND JSON_EXTRACT(properties, '$.campaignId') IN (${sql.raw(campaignIdsCsv)})
      AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY cadence
    ORDER BY impressions DESC
  `);

  // 6. Daily trend (last 30 days, impressions + clicks).
  const trendRaw = await db.execute(sql`
    SELECT DATE(createdAt) AS day,
           SUM(CASE WHEN eventName = 'campaign_impression' THEN 1 ELSE 0 END) AS impressions,
           SUM(CASE WHEN eventName = 'campaign_click' THEN 1 ELSE 0 END) AS clicks
    FROM analytics_events
    WHERE eventName IN ('campaign_impression','campaign_click')
      AND JSON_EXTRACT(properties, '$.campaignId') IN (${sql.raw(campaignIdsCsv)})
      AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    GROUP BY day
    ORDER BY day
  `);

  // 7. Top product_search queries from users in this brand's target tiers.
  let queriesRaw: unknown = [];
  if (targetTiers.length > 0) {
    const tierList = targetTiers.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");
    queriesRaw = await db.execute(sql`
      SELECT LOWER(JSON_UNQUOTE(JSON_EXTRACT(properties, '$.query'))) AS query,
             COUNT(*) AS count
      FROM analytics_events
      WHERE eventName = 'product_search'
        AND tier IN (${sql.raw(tierList)})
        AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND JSON_EXTRACT(properties, '$.query') IS NOT NULL
      GROUP BY query
      ORDER BY count DESC
      LIMIT 15
    `);
  }

  // 8. Tier gap — total users per tier in the platform.
  const platformTierRaw = await db.execute(sql`
    SELECT JSON_UNQUOTE(JSON_EXTRACT(preferences, '$.shopperProfile.priceTier')) AS tier,
           COUNT(*) AS users
    FROM users
    WHERE JSON_EXTRACT(preferences, '$.shopperProfile.priceTier') IS NOT NULL
    GROUP BY tier
  `);

  // 9. Chain affinity — what stores the reached users prefer. We need a JOIN
  // for this one because preferredChains lives in users.preferences.
  const chainRaw = await db.execute(sql`
    SELECT JSON_UNQUOTE(prefChain.chain) AS chain,
           COUNT(DISTINCT u.id) AS users
    FROM users u
    JOIN JSON_TABLE(
      u.preferences->'$.shopperProfile.preferredChains', '$[*]' COLUMNS (chain VARCHAR(64) PATH '$')
    ) AS prefChain
    WHERE u.id IN (
      SELECT DISTINCT userId
      FROM analytics_events
      WHERE eventName = 'campaign_impression'
        AND JSON_EXTRACT(properties, '$.campaignId') IN (${sql.raw(campaignIdsCsv)})
        AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND userId IS NOT NULL
    )
    GROUP BY chain
    ORDER BY users DESC
    LIMIT 10
  `);

  type Row = Record<string, unknown>;
  const tierRows = unwrap<Row>(tierRaw);
  const householdRows = unwrap<Row>(householdRaw);
  const cadenceRows = unwrap<Row>(cadenceRaw);
  const trendRows = unwrap<Row>(trendRaw);
  const queryRows = unwrap<Row>(queriesRaw);
  const platformTierRows = unwrap<Row>(platformTierRaw);
  const chainRows = unwrap<Row>(chainRaw);

  const platformTierMap = Object.fromEntries(
    platformTierRows.map((r) => [String(r.tier ?? "unknown"), Number(r.users)])
  );

  const tierGap = tierRows.map((r) => {
    const tier = String(r.tier ?? "unknown");
    const reached = Number(r.users);
    const total = platformTierMap[tier] ?? 0;
    return {
      tier,
      reached,
      total,
      pctReached: total > 0 ? Math.round((reached / total) * 1000) / 10 : 0,
    };
  });

  return {
    windowDays: 30,
    campaignIds,
    reach,
    audienceByTier: tierRows.map((r) => ({
      bucket: String(r.tier ?? "unknown"),
      users: Number(r.users),
      impressions: Number(r.impressions),
    })),
    audienceByHousehold: householdRows.map((r) => ({
      bucket: String(r.bucket ?? "unknown"),
      users: Number(r.users),
      impressions: Number(r.impressions),
    })),
    audienceByCadence: cadenceRows.map((r) => ({
      bucket: String(r.bucket ?? "unknown"),
      users: Number(r.users),
      impressions: Number(r.impressions),
    })),
    dailyTrend: trendRows.map((r) => ({
      day:
        r.day instanceof Date
          ? r.day.toISOString().slice(0, 10)
          : String(r.day),
      impressions: Number(r.impressions),
      clicks: Number(r.clicks),
    })),
    topQueries: queryRows.map((r) => ({
      query: String(r.query ?? "(empty)"),
      count: Number(r.count),
    })),
    tierGap,
    chainAffinity: chainRows.map((r) => ({
      chain: String(r.chain ?? "unknown"),
      users: Number(r.users),
    })),
  };
}

// ============ INTEGRATION CREDENTIALS ============
export async function listIntegrationCredentials(userId: number, integration?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = integration
    ? and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.integration, integration))
    : eq(integrationCredentials.userId, userId);
  const rows = await db
    .select({
      id: integrationCredentials.id,
      integration: integrationCredentials.integration,
      label: integrationCredentials.label,
      lastVerifiedAt: integrationCredentials.lastVerifiedAt,
      lastError: integrationCredentials.lastError,
      createdAt: integrationCredentials.createdAt,
      updatedAt: integrationCredentials.updatedAt,
    })
    .from(integrationCredentials)
    .where(conditions);
  return rows;
}

export async function getIntegrationCredentialCiphertext(id: number, userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.id, id), eq(integrationCredentials.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findIntegrationCredential(userId: number, integration: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(and(eq(integrationCredentials.userId, userId), eq(integrationCredentials.integration, integration)))
    .orderBy(desc(integrationCredentials.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertIntegrationCredential(values: InsertIntegrationCredential): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  // Insert; if a (userId, integration) already exists, replace its ciphertext.
  const existing = values.userId
    ? await findIntegrationCredential(values.userId, values.integration)
    : null;
  if (existing) {
    await db
      .update(integrationCredentials)
      .set({
        ciphertext: values.ciphertext,
        label: values.label ?? existing.label,
        lastError: null,
      })
      .where(eq(integrationCredentials.id, existing.id));
    return existing.id;
  }
  const inserted = await db.insert(integrationCredentials).values(values);
  return inserted[0]?.insertId ?? null;
}

export async function deleteIntegrationCredential(id: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(integrationCredentials)
    .where(and(eq(integrationCredentials.id, id), eq(integrationCredentials.userId, userId)));
}

export async function markIntegrationCredentialVerified(id: number) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(integrationCredentials)
    .set({ lastVerifiedAt: new Date(), lastError: null })
    .where(eq(integrationCredentials.id, id));
}

export async function markIntegrationCredentialError(id: number, error: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .update(integrationCredentials)
    .set({ lastError: error.slice(0, 500) })
    .where(eq(integrationCredentials.id, id));
}

// ============ APP-WIDE INTEGRATION CREDENTIALS (admin/llm keys) ============
/**
 * Look up a credential whose userId is null — used for app-wide secrets like
 * LLM API keys that the admin manages and that aren't tied to a specific user.
 */
export async function findAppIntegrationCredential(integration: string) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db
    .select()
    .from(integrationCredentials)
    .where(and(isNull(integrationCredentials.userId), eq(integrationCredentials.integration, integration)))
    .orderBy(desc(integrationCredentials.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function upsertAppIntegrationCredential(integration: string, ciphertext: string, label?: string) {
  const db = await getDb();
  if (!db) return null;
  const existing = await findAppIntegrationCredential(integration);
  if (existing) {
    await db
      .update(integrationCredentials)
      .set({ ciphertext, label: label ?? existing.label, lastError: null })
      .where(eq(integrationCredentials.id, existing.id));
    return existing.id;
  }
  const inserted = await db.insert(integrationCredentials).values({
    userId: null,
    integration,
    label: label ?? null,
    ciphertext,
  });
  return inserted[0]?.insertId ?? null;
}

export async function deleteAppIntegrationCredential(integration: string) {
  const db = await getDb();
  if (!db) return;
  await db
    .delete(integrationCredentials)
    .where(and(isNull(integrationCredentials.userId), eq(integrationCredentials.integration, integration)));
}

export async function listAppIntegrationCredentials() {
  const db = await getDb();
  if (!db) return [];
  return db
    .select({
      id: integrationCredentials.id,
      integration: integrationCredentials.integration,
      label: integrationCredentials.label,
      lastVerifiedAt: integrationCredentials.lastVerifiedAt,
      lastError: integrationCredentials.lastError,
      updatedAt: integrationCredentials.updatedAt,
    })
    .from(integrationCredentials)
    .where(isNull(integrationCredentials.userId));
}

// ============ APP SETTINGS (non-sensitive key/value) ============
export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .insert(appSettings)
    .values({ key, value })
    .onDuplicateKeyUpdate({ set: { value } });
}

export async function getAppSettings(prefix?: string): Promise<Record<string, string>> {
  const db = await getDb();
  if (!db) return {};
  const rows = await db.select().from(appSettings);
  const out: Record<string, string> = {};
  for (const row of rows) {
    if (prefix && !row.key.startsWith(prefix)) continue;
    if (row.value !== null) out[row.key] = row.value;
  }
  return out;
}

// ============ USER TOKEN HELPERS ============
// (userTokens, brandMembers, UserToken, InsertUserToken, BrandMember imports
// added to the top-of-file schema import block in Step 1.)

export async function createUserToken(data: InsertUserToken): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(userTokens).values(data);
}

export async function getUserToken(token: string): Promise<UserToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(userTokens).where(eq(userTokens.token, token)).limit(1);
  return rows[0];
}

/**
 * Atomically validate + consume a token. Returns the userId on success.
 * Returns null if the token is missing, used, expired, or of the wrong type.
 */
export async function consumeUserToken(
  token: string,
  expectedType: "email_verify" | "password_reset"
): Promise<{ userId: number } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(userTokens).where(eq(userTokens.token, token)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.type !== expectedType) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  await db.update(userTokens).set({ usedAt: new Date() }).where(eq(userTokens.id, row.id));
  return { userId: row.userId };
}

export async function invalidateUserTokensOfType(
  userId: number,
  type: "email_verify" | "password_reset"
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(userTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(userTokens.userId, userId),
      eq(userTokens.type, type),
      isNull(userTokens.usedAt),
    ));
}

export async function markUserEmailVerified(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users)
    .set({ emailVerified: true, emailVerifiedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function setUserPasswordHash(userId: number, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

// ============ BRAND MEMBER HELPERS ============
export type VendorMembership = { brand: Brand; membershipRole: "owner" | "admin" | "staff" };

export async function getVendorMembershipsForUser(userId: number): Promise<VendorMembership[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      brand: brands,
      membershipRole: brandMembers.membershipRole,
    })
    .from(brandMembers)
    .innerJoin(brands, eq(brandMembers.brandId, brands.id))
    .where(and(eq(brandMembers.userId, userId), eq(brands.kind, "vendor")));
  return rows.map(r => ({ brand: r.brand, membershipRole: r.membershipRole }));
}

export async function getAdvertiserMembershipsForUser(userId: number): Promise<VendorMembership[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      brand: brands,
      membershipRole: brandMembers.membershipRole,
    })
    .from(brandMembers)
    .innerJoin(brands, eq(brandMembers.brandId, brands.id))
    .where(and(eq(brandMembers.userId, userId), eq(brands.kind, "advertiser")));
  return rows.map(r => ({ brand: r.brand, membershipRole: r.membershipRole }));
}

export type AnyMembership = { brand: Brand; membershipRole: "owner" | "admin" | "staff" };

export async function getAllMembershipsForUser(userId: number): Promise<AnyMembership[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      brand: brands,
      membershipRole: brandMembers.membershipRole,
    })
    .from(brandMembers)
    .innerJoin(brands, eq(brandMembers.brandId, brands.id))
    .where(eq(brandMembers.userId, userId));
  return rows.map(r => ({ brand: r.brand, membershipRole: r.membershipRole }));
}

export async function createBrandMember(data: InsertBrandMember): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(brandMembers).values(data);
}

// ============ VENDOR APPLICATION HELPERS ============

export async function createVendorApplication(data: InsertVendorApplication): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(vendorApplications).values(data);
  return (result as any)[0]?.insertId ?? null;
}

export async function getPendingApplicationForUser(userId: number): Promise<VendorApplication | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(vendorApplications)
    .where(and(
      eq(vendorApplications.applicantUserId, userId),
      eq(vendorApplications.status, "pending"),
    ))
    .limit(1);
  return rows[0];
}

export async function getLatestApplicationForUser(userId: number): Promise<VendorApplication | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(vendorApplications)
    .where(eq(vendorApplications.applicantUserId, userId))
    .orderBy(desc(vendorApplications.createdAt))
    .limit(1);
  return rows[0];
}

export async function listPendingApplications(): Promise<VendorApplication[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(vendorApplications)
    .where(eq(vendorApplications.status, "pending"))
    .orderBy(desc(vendorApplications.createdAt));
}

export async function getVendorApplicationById(id: number): Promise<VendorApplication | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(vendorApplications)
    .where(eq(vendorApplications.id, id))
    .limit(1);
  return rows[0];
}

export async function markApplicationDecided(opts: {
  id: number;
  status: "approved" | "rejected";
  reviewerNote?: string;
  reviewedByUserId: number;
  resultingBrandId?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(vendorApplications)
    .set({
      status: opts.status,
      reviewerNote: opts.reviewerNote ?? null,
      reviewedByUserId: opts.reviewedByUserId,
      reviewedAt: new Date(),
      resultingBrandId: opts.resultingBrandId ?? null,
    })
    .where(eq(vendorApplications.id, opts.id));
}

/**
 * Promote a user from consumer to vendor_admin. Never downgrades — if the
 * user is super_admin, vendor_admin, or vendor_staff, leave the role alone.
 */
export async function promoteUserToVendorAdmin(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ role: "vendor_admin" })
    .where(and(eq(users.id, userId), eq(users.role, "consumer")));
}

// ============ STORE CLAIM HELPERS ============

export async function createStoreClaim(data: InsertStoreClaim): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(storeClaims).values(data);
  return (result as any)[0]?.insertId ?? null;
}

export async function getPendingClaimForBrandStore(
  brandId: number,
  storeId: number,
): Promise<StoreClaim | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(storeClaims)
    .where(and(
      eq(storeClaims.brandId, brandId),
      eq(storeClaims.storeId, storeId),
      eq(storeClaims.status, "pending"),
    ))
    .limit(1);
  return rows[0];
}

export async function getStoreClaimById(id: number): Promise<StoreClaim | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(storeClaims)
    .where(eq(storeClaims.id, id))
    .limit(1);
  return rows[0];
}

export type PendingStoreClaim = StoreClaim & { brand: Brand; store: Store };

export async function listPendingStoreClaims(): Promise<PendingStoreClaim[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      claim: storeClaims,
      brand: brands,
      store: stores,
    })
    .from(storeClaims)
    .innerJoin(brands, eq(storeClaims.brandId, brands.id))
    .innerJoin(stores, eq(storeClaims.storeId, stores.id))
    .where(eq(storeClaims.status, "pending"))
    .orderBy(desc(storeClaims.createdAt));
  return rows.map(r => ({ ...r.claim, brand: r.brand, store: r.store }));
}

export type BrandStoreClaim = StoreClaim & { store: Store };

export async function listStoreClaimsForBrand(brandId: number): Promise<BrandStoreClaim[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      claim: storeClaims,
      store: stores,
    })
    .from(storeClaims)
    .innerJoin(stores, eq(storeClaims.storeId, stores.id))
    .where(eq(storeClaims.brandId, brandId))
    .orderBy(desc(storeClaims.createdAt));
  return rows.map(r => ({ ...r.claim, store: r.store }));
}

export async function listStoresForBrand(brandId: number): Promise<Store[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(stores)
    .where(eq(stores.brandId, brandId))
    .orderBy(stores.name);
}

export async function searchUnclaimedStores(opts: {
  query?: string;
  city?: string;
  limit?: number;
}): Promise<Store[]> {
  const db = await getDb();
  if (!db) return [];
  const limit = opts.limit ?? 50;
  const conds = [isNull(stores.brandId)];
  if (opts.query) conds.push(like(stores.name, `%${opts.query}%`));
  if (opts.city) conds.push(like(stores.city, `%${opts.city}%`));
  return db
    .select()
    .from(stores)
    .where(and(...conds))
    .orderBy(stores.name)
    .limit(limit);
}

export async function markStoreClaimDecided(opts: {
  id: number;
  status: "approved" | "rejected";
  reviewerNote?: string;
  reviewedByUserId: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(storeClaims)
    .set({
      status: opts.status,
      reviewerNote: opts.reviewerNote ?? null,
      reviewedByUserId: opts.reviewedByUserId,
      reviewedAt: new Date(),
    })
    .where(eq(storeClaims.id, opts.id));
}

export async function linkStoreToBrand(storeId: number, brandId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(stores)
    .set({ brandId })
    .where(eq(stores.id, storeId));
}
