import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  getProductsByIds: vi.fn(),
  getBranchPriceMatrix: vi.fn(),
}));
vi.mock("./storeDiscovery", () => ({ discoverPhysicalStores: vi.fn() }));

import { getProductsByIds, getBranchPriceMatrix } from "../db";
import { discoverPhysicalStores } from "./storeDiscovery";
import { SmartCartEngine } from "./smartCart";

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
});
