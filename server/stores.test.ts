import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock storeDiscovery service
vi.mock("./services/storeDiscovery", () => ({
  discoverPhysicalStores: vi.fn().mockResolvedValue([
    {
      id: 42,
      placeId: "place-1",
      name: "Walmart Escazú",
      address: "Escazú, San José",
      latitude: 40.7128,
      longitude: -74.006,
      chainId: "walmart",
      distanceKm: 1.5,
      avgRating: 4.2,
    },
  ]),
}));

// Mock database functions
vi.mock("./db", () => ({
  searchStores: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "Test Store",
      latitude: 40.7128,
      longitude: -74.006,
    },
  ]),
  getStoreById: vi.fn().mockResolvedValue({
    id: 1,
    name: "Test Store",
    latitude: 40.7128,
    longitude: -74.006,
  }),
  searchProducts: vi.fn().mockResolvedValue([
    {
      id: 1,
      name: "Test Product",
      barcode: "123456789",
      category: "Grocery",
    },
  ]),
  getProductByBarcode: vi.fn().mockResolvedValue({
    id: 1,
    name: "Test Product",
    barcode: "123456789",
  }),
  getSponsoredProducts: vi.fn().mockResolvedValue([]),
  recordAdImpression: vi.fn().mockResolvedValue(undefined),
}));

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

function createAuthContext(): TrpcContext {
  return {
    user: {
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
    },
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("stores router", () => {
  it("getNearby returns stores within radius", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stores.getNearby({
      latitude: 40.7128,
      longitude: -74.006,
      radiusKm: 10,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 42,
      placeId: "place-1",
      name: "Walmart Escazú",
      chainId: "walmart",
      distanceKm: 1.5,
    });
  });

  it("search returns matching stores", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stores.search({
      query: "Test",
      limit: 20,
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Store");
  });

  it("getById returns store details", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.stores.getById({ id: 1 });

    expect(result).toMatchObject({
      id: 1,
      name: "Test Store",
    });
  });
});

describe("products router", () => {
  it("search returns matching products", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.products.search({
      query: "Test",
      limit: 20,
    });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Test Product");
  });

  it("getByBarcode returns product", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.products.getByBarcode({ barcode: "123456789" });

    expect(result).toMatchObject({
      id: 1,
      barcode: "123456789",
    });
  });
});

describe("auth router", () => {
  it("me returns null for unauthenticated user", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toBeNull();
  });

  it("me returns user for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.auth.me();

    expect(result).toMatchObject({
      id: 1,
      name: "Test User",
      email: "test@example.com",
    });
  });
});
