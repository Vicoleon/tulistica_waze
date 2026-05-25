import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float, boolean, json, index } from "drizzle-orm/mysql-core";

// ============ USERS ============
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  // bcrypt hash for local email+password auth. Null for OAuth-only users.
  passwordHash: varchar("passwordHash", { length: 255 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["consumer", "vendor_staff", "vendor_admin", "super_admin"]).default("consumer").notNull(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
  // Trust & Gamification
  trustScore: int("trustScore").default(10).notNull(), // 0-100
  totalPoints: int("totalPoints").default(0).notNull(),
  priceReportsCount: int("priceReportsCount").default(0).notNull(),
  verifiedReportsCount: int("verifiedReportsCount").default(0).notNull(),
  // Location preferences
  homeLatitude: float("homeLatitude"),
  homeLongitude: float("homeLongitude"),
  defaultRadiusKm: float("defaultRadiusKm").default(10),
  fuelCostPerKm: float("fuelCostPerKm").default(250), // ₡250/km — typical CR sedan
  timeValuePerHour: float("timeValuePerHour").default(3000), // ₡3,000/hr — CR opportunity cost
  // Preferences (extended UserPreferences type covers dietary, favorites,
  // shopper profile from onboarding, and budget settings)
  preferences: json("preferences").$type<import("../shared/profile").UserPreferences>(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ============ USER TOKENS (email verify + password reset) ============
export const userTokens = mysqlTable("user_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  type: mysqlEnum("type", ["email_verify", "password_reset"]).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_user_tokens_user").on(table.userId),
  index("idx_user_tokens_token").on(table.token),
]);

export type UserToken = typeof userTokens.$inferSelect;
export type InsertUserToken = typeof userTokens.$inferInsert;

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
  brandId: int("brandId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_stores_location").on(table.latitude, table.longitude),
  index("idx_stores_chain").on(table.chainId),
  index("idx_stores_brand").on(table.brandId),
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

// ============ BRANDS (advertiser accounts) ============
export const brands = mysqlTable("brands", {
  id: int("id").autoincrement().primaryKey(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 512 }).notNull(),
  passwordSalt: varchar("passwordSalt", { length: 128 }).notNull(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  logoUrl: text("logoUrl"),
  contactName: varchar("contactName", { length: 255 }),
  phone: varchar("phone", { length: 32 }),
  country: varchar("country", { length: 64 }),
  status: mysqlEnum("status", ["active", "suspended", "pending"]).default("pending").notNull(),
  kind: mysqlEnum("kind", ["advertiser", "vendor"]).default("advertiser").notNull(),
  // Billing
  billingEmail: varchar("billingEmail", { length: 320 }),
  taxId: varchar("taxId", { length: 64 }),
  paymentMethodLast4: varchar("paymentMethodLast4", { length: 4 }),
  paymentMethodBrand: varchar("paymentMethodBrand", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
}, (table) => [
  index("idx_brands_email").on(table.email),
  index("idx_brands_status").on(table.status),
]);

export type Brand = typeof brands.$inferSelect;
export type InsertBrand = typeof brands.$inferInsert;

// ============ BRAND TOKENS (email verify + password reset) ============
export const brandTokens = mysqlTable("brand_tokens", {
  id: int("id").autoincrement().primaryKey(),
  brandId: int("brandId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  type: mysqlEnum("type", ["email_verify", "password_reset"]).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_brand_tokens_brand").on(table.brandId),
  index("idx_brand_tokens_token").on(table.token),
]);

export type BrandToken = typeof brandTokens.$inferSelect;
export type InsertBrandToken = typeof brandTokens.$inferInsert;

// ============ BRAND MEMBERS (user ↔ brand join) ============
export const brandMembers = mysqlTable("brand_members", {
  id: int("id").autoincrement().primaryKey(),
  brandId: int("brandId").notNull(),
  userId: int("userId").notNull(),
  membershipRole: mysqlEnum("membershipRole", ["owner", "admin", "staff"]).default("staff").notNull(),
  invitedByUserId: int("invitedByUserId"),
  invitedAt: timestamp("invitedAt"),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("uniq_brand_user").on(table.brandId, table.userId),
  index("idx_brand_members_user").on(table.userId),
]);

export type BrandMember = typeof brandMembers.$inferSelect;
export type InsertBrandMember = typeof brandMembers.$inferInsert;

// ============ AD CAMPAIGNS ============
// Extended in 2026-05 with profile-aware targeting (tier, chain, basketMix,
// householdSize). New surface types: dashboard_promo, recipe_sponsored.
export const adCampaigns = mysqlTable("ad_campaigns", {
  id: int("id").autoincrement().primaryKey(),
  brandId: int("brandId"), // null for internal hardcoded campaigns; FK to brands.id when self-serve
  sponsor: varchar("sponsor", { length: 128 }), // brand/store name for "Patrocinado por X" label
  productId: int("productId"),
  name: varchar("name", { length: 255 }), // internal label distinct from creative title
  type: mysqlEnum("type", [
    "sponsored_search",
    "banner",
    "cart_suggestion",
    "dashboard_promo",
    "recipe_sponsored",
  ]).notNull(),
  status: mysqlEnum("status", ["draft", "active", "paused", "ended"]).default("draft").notNull(),
  title: varchar("title", { length: 255 }),
  description: text("description"),
  imageUrl: text("imageUrl"),
  targetUrl: text("targetUrl"),
  bidCpc: float("bidCpc").default(0), // Cost per click (currency units)
  dailyBudgetCents: int("dailyBudgetCents").default(0), // 0 = uncapped
  totalSpentCents: int("totalSpentCents").default(0),
  // Legacy keyword/category targeting
  targetKeywords: json("targetKeywords").$type<string[]>(),
  targetCategories: json("targetCategories").$type<string[]>(),
  triggerCategories: json("triggerCategories").$type<string[]>(),
  targetCities: json("targetCities").$type<string[]>(),
  // Profile-aware targeting (redesign Fase 2)
  targetTiers: json("targetTiers").$type<Array<"value" | "mid" | "premium">>(),
  targetChains: json("targetChains").$type<string[]>(),
  targetBasketMix: json("targetBasketMix").$type<string[]>(),
  targetCadences: json("targetCadences").$type<string[]>(),
  targetMinHouseholdSize: varchar("targetMinHouseholdSize", { length: 8 }),
  // Schedule
  activeFrom: timestamp("activeFrom"),
  activeUntil: timestamp("activeUntil"),
  isActive: boolean("isActive").default(true),
  // Stats counters (running totals — daily detail lives in campaign_metrics)
  impressions: int("impressions").default(0),
  clicks: int("clicks").default(0),
  // Daily budget & frequency capping (bid engine v2)
  dailyBudget: float("dailyBudget"),
  dailySpend: float("dailySpend").default(0),
  dailySpendDate: timestamp("dailySpendDate"), // truncated to date — we compare dates only
  maxImpressionsPerUserPerDay: int("maxImpressionsPerUserPerDay").default(5),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_campaigns_brand").on(table.brandId),
  index("idx_campaigns_status").on(table.status),
]);

export type AdCampaign = typeof adCampaigns.$inferSelect;
export type InsertAdCampaign = typeof adCampaigns.$inferInsert;

// ============ CAMPAIGN METRICS (daily aggregation for graphs) ============
export const campaignMetrics = mysqlTable("campaign_metrics", {
  id: int("id").autoincrement().primaryKey(),
  campaignId: int("campaignId").notNull(),
  brandId: int("brandId"),
  // Day bucket stored as YYYY-MM-DD string for cheap groupBy queries
  day: varchar("day", { length: 10 }).notNull(),
  impressions: int("impressions").default(0).notNull(),
  clicks: int("clicks").default(0).notNull(),
  spendCents: int("spendCents").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_metrics_campaign_day").on(table.campaignId, table.day),
  index("idx_metrics_brand_day").on(table.brandId, table.day),
]);

export type CampaignMetric = typeof campaignMetrics.$inferSelect;
export type InsertCampaignMetric = typeof campaignMetrics.$inferInsert;

// ============ INVOICES (monthly billing) ============
export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  brandId: int("brandId").notNull(),
  // Period bucket as YYYY-MM
  periodMonth: varchar("periodMonth", { length: 7 }).notNull(),
  status: mysqlEnum("status", ["draft", "open", "paid", "uncollectible", "void"]).default("open").notNull(),
  subtotalCents: int("subtotalCents").default(0).notNull(),
  taxCents: int("taxCents").default(0).notNull(),
  totalCents: int("totalCents").default(0).notNull(),
  currency: varchar("currency", { length: 8 }).default("USD").notNull(),
  issuedAt: timestamp("issuedAt").defaultNow().notNull(),
  dueAt: timestamp("dueAt"),
  paidAt: timestamp("paidAt"),
  paymentProviderId: varchar("paymentProviderId", { length: 128 }),
  paymentProvider: varchar("paymentProvider", { length: 64 }),
  notes: text("notes"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_invoices_brand_period").on(table.brandId, table.periodMonth),
  index("idx_invoices_status").on(table.status),
]);

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;

// Line items per invoice — one row per campaign + day bucket aggregation
export const invoiceLineItems = mysqlTable("invoice_line_items", {
  id: int("id").autoincrement().primaryKey(),
  invoiceId: int("invoiceId").notNull(),
  campaignId: int("campaignId"),
  description: varchar("description", { length: 512 }).notNull(),
  quantity: int("quantity").default(1).notNull(),
  unitPriceCents: int("unitPriceCents").default(0).notNull(),
  amountCents: int("amountCents").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_lineitems_invoice").on(table.invoiceId),
]);

export type InvoiceLineItem = typeof invoiceLineItems.$inferSelect;
export type InsertInvoiceLineItem = typeof invoiceLineItems.$inferInsert;

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
  // Steps stored as a JSON array of strings. Null for imported recipes that
  // only provided ingredients.
  steps: json("steps").$type<string[]>(),
  servings: int("servings"),
  prepTimeMinutes: int("prepTimeMinutes"),
  description: text("description"),
  imageUrl: text("imageUrl"),
  // When true the recipe was generated by the local AI assistant.
  isAiGenerated: boolean("isAiGenerated").default(false),
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


// ============ ANALYTICS EVENTS (from redesign) ============
// Append-only event log. Used to compose dashboards and feed the ad-targeting
// engine. `tier` is denormalized at insert time so we don't JOIN users on every
// aggregate. `properties` is opaque JSON — keep server-side TS types beside
// each emitter (server/analytics.ts).
export const analyticsEvents = mysqlTable("analytics_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"), // nullable for anonymous / pre-login
  sessionId: varchar("sessionId", { length: 64 }),
  eventName: varchar("eventName", { length: 64 }).notNull(),
  properties: json("properties").$type<Record<string, unknown>>(),
  // Denormalized targeting facets — derived from the user at insert time.
  tier: varchar("tier", { length: 16 }), // value | mid | premium | null
  cadence: varchar("cadence", { length: 16 }),
  householdSize: varchar("householdSize", { length: 8 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_analytics_event_time").on(table.eventName, table.createdAt),
  index("idx_analytics_user_time").on(table.userId, table.createdAt),
  index("idx_analytics_tier_time").on(table.tier, table.createdAt),
]);

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type InsertAnalyticsEvent = typeof analyticsEvents.$inferInsert;

// ============ INTEGRATION CREDENTIALS (encrypted vault, from angry-engelbart) ============
/**
 * Encrypted credentials for third-party integrations (e.g. Auto Mercado).
 * The `ciphertext` column stores a JSON blob produced by the vault helper:
 *   { iv: hex, tag: hex, data: hex }
 * Decryption uses a key derived from JWT_SECRET via HKDF — rotating JWT_SECRET
 * invalidates all stored credentials, which is the desired security property.
 */
export const integrationCredentials = mysqlTable("integration_credentials", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId"),
  integration: varchar("integration", { length: 64 }).notNull(),
  label: varchar("label", { length: 128 }),
  ciphertext: text("ciphertext").notNull(),
  lastVerifiedAt: timestamp("lastVerifiedAt"),
  lastError: text("lastError"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_creds_user_integration").on(table.userId, table.integration),
]);

export type IntegrationCredential = typeof integrationCredentials.$inferSelect;
export type InsertIntegrationCredential = typeof integrationCredentials.$inferInsert;

// ============ APP SETTINGS (key-value, non-sensitive) ============
/**
 * Application-wide settings. Used for non-secret config the admin can change
 * at runtime (active LLM provider, model name, feature flags). Secrets go in
 * integrationCredentials instead.
 */
export const appSettings = mysqlTable("app_settings", {
  key: varchar("settingKey", { length: 128 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AppSetting = typeof appSettings.$inferSelect;

// Brand portal tables (brands, brandTokens) are defined above —
// see the c02ee38 implementation.

// ============ VENDOR APPLICATIONS ============
export const vendorApplications = mysqlTable("vendor_applications", {
  id: int("id").autoincrement().primaryKey(),
  applicantUserId: int("applicantUserId").notNull(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  description: text("description"),
  desiredStoresNote: text("desiredStoresNote"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewerNote: text("reviewerNote"),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: timestamp("reviewedAt"),
  resultingBrandId: int("resultingBrandId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_vendor_apps_applicant").on(table.applicantUserId),
  index("idx_vendor_apps_status").on(table.status),
]);

export type VendorApplication = typeof vendorApplications.$inferSelect;
export type InsertVendorApplication = typeof vendorApplications.$inferInsert;
