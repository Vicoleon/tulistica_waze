import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float, boolean, json, index } from "drizzle-orm/mysql-core";

// ============ USERS ============
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  // Trust & Gamification
  trustScore: int("trustScore").default(10).notNull(), // 0-100
  totalPoints: int("totalPoints").default(0).notNull(),
  priceReportsCount: int("priceReportsCount").default(0).notNull(),
  verifiedReportsCount: int("verifiedReportsCount").default(0).notNull(),
  // Location preferences
  homeLatitude: float("homeLatitude"),
  homeLongitude: float("homeLongitude"),
  defaultRadiusKm: float("defaultRadiusKm").default(10),
  fuelCostPerKm: float("fuelCostPerKm").default(0.15),
  timeValuePerHour: float("timeValuePerHour").default(15),
  // Preferences
  preferences: json("preferences").$type<{
    dietaryRestrictions?: string[];
    favoriteStores?: number[];
    monthlyBudget?: number;
    budgetAlertThreshold?: number;
    budgetCycleStartDay?: number;
  }>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============ STORES ============
export const stores = mysqlTable("stores", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  chainId: varchar("chainId", { length: 64 }), // e.g., "walmart", "costco"
  address: text("address"),
  city: varchar("city", { length: 128 }),
  state: varchar("state", { length: 64 }),
  zipCode: varchar("zipCode", { length: 20 }),
  // Geospatial (stored as separate lat/lng for MySQL compatibility)
  latitude: float("latitude").notNull(),
  longitude: float("longitude").notNull(),
  // Store info
  phone: varchar("phone", { length: 32 }),
  hours: json("hours").$type<{ [day: string]: { open: string; close: string } }>(),
  imageUrl: text("imageUrl"),
  avgRating: float("avgRating").default(0),
  totalRatings: int("totalRatings").default(0),
  isActive: boolean("isActive").default(true),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_stores_location").on(table.latitude, table.longitude),
  index("idx_stores_chain").on(table.chainId),
]);

export type Store = typeof stores.$inferSelect;
export type InsertStore = typeof stores.$inferInsert;

// ============ PRODUCTS ============
export const products = mysqlTable("products", {
  id: int("id").autoincrement().primaryKey(),
  barcode: varchar("barcode", { length: 64 }).unique(),
  name: varchar("name", { length: 255 }).notNull(),
  brand: varchar("brand", { length: 128 }),
  category: varchar("category", { length: 128 }),
  subcategory: varchar("subcategory", { length: 128 }),
  description: text("description"),
  imageUrl: text("imageUrl"),
  unit: varchar("unit", { length: 32 }), // e.g., "oz", "lb", "each"
  unitSize: float("unitSize"), // e.g., 16 for 16oz
  // Ad-tech
  isSponsored: boolean("isSponsored").default(false),
  sponsoredBid: float("sponsoredBid").default(0),
  // Search optimization
  searchKeywords: text("searchKeywords"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_products_barcode").on(table.barcode),
  index("idx_products_category").on(table.category),
]);

export type Product = typeof products.$inferSelect;
export type InsertProduct = typeof products.$inferInsert;

// ============ PRICE ENTRIES ============
export const priceEntries = mysqlTable("price_entries", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  productId: int("productId").notNull(),
  userId: int("userId").notNull(),
  price: float("price").notNull(),
  // Verification
  isVerified: boolean("isVerified").default(false),
  isOutlier: boolean("isOutlier").default(false),
  voteCount: int("voteCount").default(0),
  confirmationCount: int("confirmationCount").default(0),
  // Geofence validation
  submittedLatitude: float("submittedLatitude"),
  submittedLongitude: float("submittedLongitude"),
  withinGeofence: boolean("withinGeofence").default(false),
  // Stats for outlier detection
  zScore: float("zScore"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_price_store_product").on(table.storeId, table.productId),
  index("idx_price_product").on(table.productId),
  index("idx_price_created").on(table.createdAt),
]);

export type PriceEntry = typeof priceEntries.$inferSelect;
export type InsertPriceEntry = typeof priceEntries.$inferInsert;

// ============ PRICE HISTORY (for trends) ============
export const priceHistory = mysqlTable("price_history", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  productId: int("productId").notNull(),
  price: float("price").notNull(),
  recordedAt: timestamp("recordedAt").defaultNow().notNull(),
}, (table) => [
  index("idx_history_store_product").on(table.storeId, table.productId),
]);

export type PriceHistory = typeof priceHistory.$inferSelect;

// ============ SHOPPING LISTS ============
export const shoppingLists = mysqlTable("shopping_lists", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  ownerId: int("ownerId").notNull(),
  isShared: boolean("isShared").default(false),
  shareCode: varchar("shareCode", { length: 32 }).unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ShoppingList = typeof shoppingLists.$inferSelect;
export type InsertShoppingList = typeof shoppingLists.$inferInsert;

// ============ LIST MEMBERS (for shared lists) ============
export const listMembers = mysqlTable("list_members", {
  id: int("id").autoincrement().primaryKey(),
  listId: int("listId").notNull(),
  userId: int("userId").notNull(),
  canEdit: boolean("canEdit").default(true),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
}, (table) => [
  index("idx_members_list").on(table.listId),
  index("idx_members_user").on(table.userId),
]);

export type ListMember = typeof listMembers.$inferSelect;

// ============ LIST ITEMS ============
export const listItems = mysqlTable("list_items", {
  id: int("id").autoincrement().primaryKey(),
  listId: int("listId").notNull(),
  productId: int("productId"),
  customName: varchar("customName", { length: 255 }), // For items not in DB
  quantity: int("quantity").default(1),
  unit: varchar("unit", { length: 32 }),
  isChecked: boolean("isChecked").default(false),
  checkedByUserId: int("checkedByUserId"),
  checkedAt: timestamp("checkedAt"),
  addedByUserId: int("addedByUserId"),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_items_list").on(table.listId),
]);

export type ListItem = typeof listItems.$inferSelect;
export type InsertListItem = typeof listItems.$inferInsert;

// ============ PANTRY ITEMS ============
export const pantryItems = mysqlTable("pantry_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: int("productId"),
  customName: varchar("customName", { length: 255 }),
  quantity: int("quantity").default(1),
  // Purchase tracking for predictions
  lastPurchasedAt: timestamp("lastPurchasedAt"),
  avgDaysBetweenPurchases: float("avgDaysBetweenPurchases"),
  purchaseCount: int("purchaseCount").default(0),
  // Notifications
  notifyWhenLow: boolean("notifyWhenLow").default(true),
  lowThreshold: int("lowThreshold").default(1),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_pantry_user").on(table.userId),
]);

export type PantryItem = typeof pantryItems.$inferSelect;
export type InsertPantryItem = typeof pantryItems.$inferInsert;

// ============ PURCHASE HISTORY (for pantry predictions) ============
export const purchaseHistory = mysqlTable("purchase_history", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: int("productId"),
  customName: varchar("customName", { length: 255 }),
  storeId: int("storeId"),
  price: float("price"),
  quantity: int("quantity").default(1),
  purchasedAt: timestamp("purchasedAt").defaultNow().notNull(),
}, (table) => [
  index("idx_purchase_user").on(table.userId),
  index("idx_purchase_product").on(table.productId),
]);

export type PurchaseHistoryEntry = typeof purchaseHistory.$inferSelect;

// ============ AD CAMPAIGNS ============
export const adCampaigns = mysqlTable("ad_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  productId: int("productId"),
  type: mysqlEnum("type", ["sponsored_search", "banner", "cart_suggestion"]).notNull(),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  imageUrl: text("imageUrl"),
  targetUrl: text("targetUrl"),
  bidCpc: float("bidCpc").default(0), // Cost per click
  // Targeting
  targetKeywords: json("targetKeywords").$type<string[]>(),
  targetCategories: json("targetCategories").$type<string[]>(),
  triggerCategories: json("triggerCategories").$type<string[]>(), // For cart-based suggestions
  // Schedule
  activeFrom: timestamp("activeFrom"),
  activeUntil: timestamp("activeUntil"),
  isActive: boolean("isActive").default(true),
  // Stats
  impressions: int("impressions").default(0),
  clicks: int("clicks").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AdCampaign = typeof adCampaigns.$inferSelect;
export type InsertAdCampaign = typeof adCampaigns.$inferInsert;

// ============ USER ACHIEVEMENTS ============
export const achievements = mysqlTable("achievements", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  iconUrl: text("iconUrl"),
  pointsRequired: int("pointsRequired").default(0),
  reportsRequired: int("reportsRequired").default(0),
  badgeType: mysqlEnum("badgeType", ["bronze", "silver", "gold", "platinum"]).default("bronze"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Achievement = typeof achievements.$inferSelect;

export const userAchievements = mysqlTable("user_achievements", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  achievementId: int("achievementId").notNull(),
  earnedAt: timestamp("earnedAt").defaultNow().notNull(),
}, (table) => [
  index("idx_user_achievements").on(table.userId),
]);

export type UserAchievement = typeof userAchievements.$inferSelect;

// ============ LEADERBOARD (cached weekly/monthly) ============
export const leaderboard = mysqlTable("leaderboard", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  period: mysqlEnum("period", ["weekly", "monthly", "alltime"]).notNull(),
  periodStart: timestamp("periodStart"),
  points: int("points").default(0),
  rank: int("rank"),
  priceReports: int("priceReports").default(0),
  verifiedReports: int("verifiedReports").default(0),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_leaderboard_period").on(table.period, table.rank),
]);

export type LeaderboardEntry = typeof leaderboard.$inferSelect;

// ============ PRICE VOTES ============
export const priceVotes = mysqlTable("price_votes", {
  id: int("id").autoincrement().primaryKey(),
  priceEntryId: int("priceEntryId").notNull(),
  userId: int("userId").notNull(),
  voteType: mysqlEnum("voteType", ["confirm", "dispute"]).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_votes_entry").on(table.priceEntryId),
]);

export type PriceVote = typeof priceVotes.$inferSelect;

// ============ SAVED RECIPES ============
export const savedRecipes = mysqlTable("saved_recipes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  sourceUrl: text("sourceUrl"),
  ingredients: json("ingredients").$type<{ name: string; quantity?: string; unit?: string; productId?: number }[]>(),
  servings: int("servings"),
  imageUrl: text("imageUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_recipes_user").on(table.userId),
]);

export type SavedRecipe = typeof savedRecipes.$inferSelect;
export type InsertSavedRecipe = typeof savedRecipes.$inferInsert;

// ============ PRICE ALERTS ============
export const priceAlerts = mysqlTable("price_alerts", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  productId: int("productId").notNull(),
  targetPrice: float("targetPrice").notNull(), // Alert when price drops below this
  currentLowestPrice: float("currentLowestPrice"),
  currentLowestStoreId: int("currentLowestStoreId"),
  isActive: boolean("isActive").default(true),
  lastNotifiedAt: timestamp("lastNotifiedAt"),
  notificationCount: int("notificationCount").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_alerts_user").on(table.userId),
  index("idx_alerts_product").on(table.productId),
  index("idx_alerts_active").on(table.isActive),
]);

export type PriceAlert = typeof priceAlerts.$inferSelect;
export type InsertPriceAlert = typeof priceAlerts.$inferInsert;

// ============ STORE CROWDEDNESS REPORTS ============
export const storeCrowdedness = mysqlTable("store_crowdedness", {
  id: int("id").autoincrement().primaryKey(),
  storeId: int("storeId").notNull(),
  userId: int("userId"),
  crowdednessLevel: int("crowdednessLevel").notNull(), // 0-100
  reportSource: mysqlEnum("reportSource", ["user", "google", "estimated"]).default("user"),
  waitTimeMinutes: int("waitTimeMinutes"),
  comment: text("comment"),
  reportedAt: timestamp("reportedAt").defaultNow().notNull(),
  expiresAt: timestamp("expiresAt"), // Crowdedness reports expire after ~30 mins
}, (table) => [
  index("idx_crowdedness_store").on(table.storeId),
  index("idx_crowdedness_time").on(table.reportedAt),
]);

export type StoreCrowdedness = typeof storeCrowdedness.$inferSelect;
export type InsertStoreCrowdedness = typeof storeCrowdedness.$inferInsert;

// ============ GOOGLE PLACES CACHE ============
export const googlePlacesCache = mysqlTable("google_places_cache", {
  id: int("id").autoincrement().primaryKey(),
  placeId: varchar("placeId", { length: 255 }).notNull().unique(),
  storeId: int("storeId"), // Link to our stores table if imported
  name: varchar("name", { length: 255 }).notNull(),
  address: text("address"),
  latitude: float("latitude").notNull(),
  longitude: float("longitude").notNull(),
  rating: float("rating"),
  userRatingsTotal: int("userRatingsTotal"),
  priceLevel: int("priceLevel"),
  types: json("types").$type<string[]>(),
  phone: varchar("phone", { length: 32 }),
  website: text("website"),
  openNow: boolean("openNow"),
  lastFetchedAt: timestamp("lastFetchedAt").defaultNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_places_location").on(table.latitude, table.longitude),
]);

export type GooglePlaceCache = typeof googlePlacesCache.$inferSelect;
export type InsertGooglePlaceCache = typeof googlePlacesCache.$inferInsert;
