import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock external APIs
vi.mock("./services/externalApis", () => ({
  searchNearbyGroceryStores: vi.fn().mockResolvedValue([
    {
      placeId: "ChIJ_test123",
      name: "Test Grocery Store",
      address: "123 Test St",
      latitude: 40.7128,
      longitude: -74.006,
      rating: 4.5,
      userRatingsTotal: 100,
      openNow: true,
    },
  ]),
  getPlaceDetails: vi.fn().mockResolvedValue({
    placeId: "ChIJ_test123",
    name: "Test Grocery Store",
    address: "123 Test St",
    latitude: 40.7128,
    longitude: -74.006,
    rating: 4.5,
    userRatingsTotal: 100,
    phone: "555-1234",
    website: "https://test.com",
  }),
  searchStoresByText: vi.fn().mockResolvedValue([]),
  estimateStoreCrowdedness: vi.fn().mockReturnValue({
    currentPopularity: 45,
    usualPopularity: 50,
    status: "somewhat_busy",
  }),
  lookupProduct: vi.fn().mockResolvedValue({
    barcode: "012345678901",
    name: "Test Product",
    brand: "Test Brand",
    category: "Test Category",
    imageUrl: "https://test.com/image.jpg",
  }),
  searchProductsOpenFoodFacts: vi.fn().mockResolvedValue([]),
}));

// Mock database functions
vi.mock("./db", () => ({
  cacheGooglePlace: vi.fn().mockResolvedValue(1),
  getGooglePlaceByPlaceId: vi.fn().mockResolvedValue(null),
  getNearbyGooglePlaces: vi.fn().mockResolvedValue([]),
  importGooglePlaceAsStore: vi.fn().mockResolvedValue(1),
  getStoreById: vi.fn().mockResolvedValue({
    id: 1,
    name: "Test Store",
    avgRating: 4.0,
    totalRatings: 50,
  }),
  getStoreCrowdedness: vi.fn().mockResolvedValue(null),
  reportStoreCrowdedness: vi.fn().mockResolvedValue(1),
  getRecentCrowdednessReports: vi.fn().mockResolvedValue([]),
  getUserPriceAlerts: vi.fn().mockResolvedValue([]),
  createPriceAlert: vi.fn().mockResolvedValue(1),
  updatePriceAlert: vi.fn().mockResolvedValue(undefined),
  deletePriceAlert: vi.fn().mockResolvedValue(undefined),
  getPricesForProduct: vi.fn().mockResolvedValue([
    { storeId: 1, price: 2.99 },
    { storeId: 2, price: 3.49 },
  ]),
  getActiveAlertsForProduct: vi.fn().mockResolvedValue([]),
  markAlertNotified: vi.fn().mockResolvedValue(undefined),
  getProductByBarcode: vi.fn().mockResolvedValue(null),
  createProduct: vi.fn().mockResolvedValue(1),
  getProductById: vi.fn().mockResolvedValue({
    id: 1,
    name: "Test Product",
  }),
  recordAnalyticsEvent: vi.fn().mockResolvedValue(undefined),
  getAnalyticsSummary: vi.fn().mockResolvedValue({
    days: 7,
    totalEvents: 0,
    byTier: [],
    byEvent: [],
    topQueries: [],
    onboardingFunnel: { started: 0, completed: 0, skipped: 0 },
  }),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "consumer",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    trustScore: 50,
    totalPoints: 100,
    priceReportsCount: 10,
    verifiedReportsCount: 8,
    homeLatitude: 40.7128,
    homeLongitude: -74.006,
    defaultRadiusKm: 10,
    fuelCostPerKm: 0.15,
    timeValuePerHour: 15,
    preferences: null,
  };

  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

function createPublicContext(): TrpcContext {
  return {
    user: null,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("Google Places Integration", () => {
  it("searches nearby grocery stores", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.googlePlaces.searchNearby({
      latitude: 40.7128,
      longitude: -74.006,
      radiusMeters: 5000,
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Grocery Store");
    expect(result[0].placeId).toBe("ChIJ_test123");
  });

  it("gets place details", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.googlePlaces.getDetails({
      placeId: "ChIJ_test123",
    });

    expect(result).not.toBeNull();
    expect(result?.name).toBe("Test Grocery Store");
    expect(result?.phone).toBe("555-1234");
  });

  it("imports Google Place as store (authenticated)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.googlePlaces.importAsStore({
      placeId: "ChIJ_test123",
    });

    expect(result.storeId).toBe(1);
  });
});

describe("Store Crowdedness", () => {
  it("gets current crowdedness with estimation", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.crowdedness.getCurrent({
      storeId: 1,
    });

    expect(result.estimated).toBeDefined();
    expect(result.estimated.status).toBe("somewhat_busy");
    expect(result.current).toBeDefined();
  });

  it("reports crowdedness (authenticated)", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.crowdedness.report({
      storeId: 1,
      crowdednessLevel: 75,
      waitTimeMinutes: 10,
      comment: "Long checkout lines",
    });

    expect(result.id).toBe(1);
  });
});

describe("Price Alerts", () => {
  it("gets user price alerts", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.priceAlerts.getAll();

    expect(Array.isArray(result)).toBe(true);
  });

  it("creates a price alert", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.priceAlerts.create({
      productId: 1,
      targetPrice: 2.50,
    });

    expect(result.id).toBe(1);
  });

  it("updates a price alert", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.priceAlerts.update({
      id: 1,
      targetPrice: 2.25,
      isActive: true,
    });

    expect(result.success).toBe(true);
  });

  it("deletes a price alert", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.priceAlerts.delete({
      id: 1,
    });

    expect(result.success).toBe(true);
  });
});

describe("Product Lookup", () => {
  it("looks up product by barcode from external API", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.productLookup.byBarcode({
      barcode: "012345678901",
    });

    expect(result.source).toBe("external");
    expect(result.product).not.toBeNull();
    expect(result.product?.name).toBe("Test Product");
  });
});
