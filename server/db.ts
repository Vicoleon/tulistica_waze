import { eq, and, desc, asc, sql, gte, lte, like, or, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users, stores, products, priceEntries, priceHistory,
  shoppingLists, listMembers, listItems, pantryItems, purchaseHistory,
  adCampaigns, achievements, userAchievements, leaderboard, priceVotes,
  savedRecipes, InsertStore, InsertProduct, InsertPriceEntry,
  InsertShoppingList, InsertListItem, InsertPantryItem, InsertAdCampaign,
  InsertSavedRecipe
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
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
    values.role = 'admin';
    updateSet.role = 'admin';
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
}

export async function recordAdClick(adId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(adCampaigns)
    .set({ clicks: sql`${adCampaigns.clicks} + 1` })
    .where(eq(adCampaigns.id, adId));
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
