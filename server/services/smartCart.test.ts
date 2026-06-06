import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  getProductsByIds: vi.fn(),
  getBranchPriceMatrix: vi.fn(),
}));
vi.mock("./storeDiscovery", () => ({ discoverPhysicalStores: vi.fn() }));

import { getProductsByIds, getBranchPriceMatrix } from "../db";
import { discoverPhysicalStores } from "./storeDiscovery";
import {
  SmartCartEngine,
  calculatePointsForPriceReport,
  isOutlierPrice,
  shouldRequireConfirmation,
  calculateZScore,
  validateGeofence,
} from "./smartCart";

const prefs = {
  fuelCostPerKm: 100,
  timeValuePerHour: 0,
  homeLatitude: 9.93,
  homeLongitude: -84.08,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SmartCartEngine.optimizeCart", () => {
  it("prices branches via getBranchPriceMatrix, uses real branch ids, no online stores", async () => {
    vi.mocked(discoverPhysicalStores).mockResolvedValue([
      { id: 502, placeId: "w1", name: "Walmart Escazú", address: "Escazú", latitude: 9.92, longitude: -84.14, chainId: "walmart", distanceKm: 2, avgRating: 4 },
      { id: 503, placeId: "m1", name: "MaxiPalí Centro", address: "San José", latitude: 9.93, longitude: -84.08, chainId: "maxipali", distanceKm: 1, avgRating: 4 },
    ] as any);
    vi.mocked(getProductsByIds).mockResolvedValue([
      { id: 1, name: "Arroz" },
      { id: 2, name: "Agua" },
    ] as any);
    vi.mocked(getBranchPriceMatrix).mockResolvedValue([
      { storeId: 502, productId: 1, price: 1000, source: "reported" },
      { storeId: 502, productId: 2, price: 500, source: "reported" },
      { storeId: 503, productId: 1, price: 700, source: "reported" },
      { storeId: 503, productId: 2, price: 900, source: "estimated" },
    ] as any);

    const engine = new SmartCartEngine(prefs);
    const results = await engine.optimizeCart([1, 2], 10);

    expect(results.length).toBeGreaterThan(0);
    const allStoreNames = results.flatMap((r) => r.stores.map((s) => s.name));
    expect(allStoreNames.some((n) => /\(en l[íi]nea\)/i.test(n))).toBe(false);
    const single = results.find((r) => r.type === "SINGLE")!;
    // Cheapest single = MaxiPalí (id 503): cart 700+900=1600, trip 2km*100=200 -> 1800,
    // vs Walmart cart 1000+500=1500, trip 4km*100=400 -> 1900. 1800 < 1900.
    expect(single.stores[0].id).toBe(503);
    const maxiArroz = results
      .flatMap((r) => r.itemBreakdown)
      .find((it) => it.storeName === "MaxiPalí Centro" && it.productName === "Arroz");
    expect(maxiArroz).toMatchObject({ price: 700, storeId: 503, source: "reported" });
  });

  it("returns [] when no physical stores are found", async () => {
    vi.mocked(discoverPhysicalStores).mockResolvedValue([]);
    const engine = new SmartCartEngine(prefs);
    expect(await engine.optimizeCart([1], 10)).toEqual([]);
  });

  it("does not throw and returns [] when all requested products are missing from the matrix", async () => {
    // Stores exist, but the price matrix has no rows for the requested products,
    // so every store exceeds MAX_MISSING_RATIO and is dropped.
    vi.mocked(discoverPhysicalStores).mockResolvedValue([
      { id: 502, placeId: "w1", name: "Walmart Escazú", address: "Escazú", latitude: 9.92, longitude: -84.14, chainId: "walmart", distanceKm: 2, avgRating: 4 },
      { id: 503, placeId: "m1", name: "MaxiPalí Centro", address: "San José", latitude: 9.93, longitude: -84.08, chainId: "maxipali", distanceKm: 1, avgRating: 4 },
    ] as any);
    vi.mocked(getProductsByIds).mockResolvedValue([
      { id: 1, name: "Arroz" },
      { id: 2, name: "Agua" },
    ] as any);
    vi.mocked(getBranchPriceMatrix).mockResolvedValue([] as any);

    const engine = new SmartCartEngine(prefs);
    const results = await engine.optimizeCart([1, 2], 10);

    expect(Array.isArray(results)).toBe(true);
    expect(results).toEqual([]);
  });
});

describe("calculatePointsForPriceReport", () => {
  it("awards the base 10 points for an unverified, low-trust report", () => {
    expect(calculatePointsForPriceReport(false, 10)).toBe(10);
  });

  it("adds 5 points when the report is verified", () => {
    expect(calculatePointsForPriceReport(true, 10)).toBe(15);
  });

  it("adds 5 points when the user's trust score is >= 80", () => {
    expect(calculatePointsForPriceReport(false, 80)).toBe(15);
  });

  it("stacks the verified and high-trust bonuses", () => {
    expect(calculatePointsForPriceReport(true, 80)).toBe(20);
  });

  it("does not award the trust bonus just below the threshold", () => {
    expect(calculatePointsForPriceReport(false, 79)).toBe(10);
  });
});

describe("calculateZScore", () => {
  it("returns 0 when stdDev is 0 (avoids divide-by-zero)", () => {
    expect(calculateZScore(100, 50, 0)).toBe(0);
  });

  it("returns the absolute number of standard deviations from the mean", () => {
    expect(calculateZScore(130, 100, 10)).toBe(3);
    expect(calculateZScore(70, 100, 10)).toBe(3);
  });
});

describe("isOutlierPrice", () => {
  it("flags a price beyond the 2.5 stdDev threshold", () => {
    // z = (200 - 100) / 10 = 10 > 2.5
    expect(isOutlierPrice(200, 100, 10)).toBe(true);
  });

  it("does not flag a price within the threshold", () => {
    // z = (110 - 100) / 10 = 1 <= 2.5
    expect(isOutlierPrice(110, 100, 10)).toBe(false);
  });

  it("respects a custom threshold", () => {
    // z = 2, below default 2.5 but above a custom 1.5
    expect(isOutlierPrice(120, 100, 10, 1.5)).toBe(true);
    expect(isOutlierPrice(120, 100, 10)).toBe(false);
  });
});

describe("shouldRequireConfirmation", () => {
  it("requires confirmation for a trust score below 30", () => {
    expect(shouldRequireConfirmation(29)).toBe(true);
    expect(shouldRequireConfirmation(0)).toBe(true);
  });

  it("does not require confirmation at or above 30", () => {
    expect(shouldRequireConfirmation(30)).toBe(false);
    expect(shouldRequireConfirmation(85)).toBe(false);
  });
});

describe("validateGeofence", () => {
  const userLat = 9.93;
  const userLon = -84.08;

  it("is true when the store is within ~100m", () => {
    // ~11m north of the user — comfortably inside the 100m default radius.
    expect(validateGeofence(userLat, userLon, userLat + 0.0001, userLon)).toBe(true);
  });

  it("is false when the store is far away", () => {
    // ~1km+ away.
    expect(validateGeofence(userLat, userLon, userLat + 0.05, userLon)).toBe(false);
  });

  it("respects a custom max-distance radius", () => {
    // ~111m north of the user: outside default 100m, inside a 200m radius.
    expect(validateGeofence(userLat, userLon, userLat + 0.001, userLon)).toBe(false);
    expect(validateGeofence(userLat, userLon, userLat + 0.001, userLon, 200)).toBe(true);
  });
});
