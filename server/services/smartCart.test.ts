import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  getProductsByIds: vi.fn(),
  getPriceMatrix: vi.fn(),
  getOnlineStoreIdsByChain: vi.fn(),
}));
vi.mock("./storeDiscovery", () => ({ discoverPhysicalStores: vi.fn() }));

import { getProductsByIds, getPriceMatrix, getOnlineStoreIdsByChain } from "../db";
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
  it("prices physical branches from their chain's online base and never lists online stores", async () => {
    vi.mocked(discoverPhysicalStores).mockResolvedValue([
      { placeId: "w1", name: "Walmart Escazú", address: "Escazú", latitude: 9.92, longitude: -84.14, chainId: "walmart", distanceKm: 2, avgRating: 4 },
      { placeId: "m1", name: "MaxiPalí Centro", address: "San José", latitude: 9.93, longitude: -84.08, chainId: "maxipali", distanceKm: 1, avgRating: 4 },
    ] as any);
    vi.mocked(getOnlineStoreIdsByChain).mockResolvedValue(
      new Map([["walmart", 10], ["maxipali", 20]])
    );
    vi.mocked(getProductsByIds).mockResolvedValue([
      { id: 1, name: "Arroz" },
      { id: 2, name: "Agua" },
    ] as any);
    vi.mocked(getPriceMatrix).mockResolvedValue([
      { storeId: 10, productId: 1, price: 1000, isVerified: true },
      { storeId: 10, productId: 2, price: 500, isVerified: true },
      { storeId: 20, productId: 1, price: 700, isVerified: true },
      { storeId: 20, productId: 2, price: 900, isVerified: true },
    ] as any);

    const engine = new SmartCartEngine(prefs);
    const results = await engine.optimizeCart([1, 2], 10);

    expect(results.length).toBeGreaterThan(0);
    const allStoreNames = results.flatMap((r) => r.stores.map((s) => s.name));
    expect(allStoreNames.some((n) => /\(en l[íi]nea\)/i.test(n))).toBe(false);
    const single = results.find((r) => r.type === "SINGLE")!;
    expect(single.stores[0].address).toBeTruthy();
    const maxiArroz = results
      .flatMap((r) => r.itemBreakdown)
      .find((it) => it.storeName === "MaxiPalí Centro" && it.productName === "Arroz");
    expect(maxiArroz?.price).toBe(700);
  });

  it("returns [] when no physical stores are found", async () => {
    vi.mocked(discoverPhysicalStores).mockResolvedValue([]);
    const engine = new SmartCartEngine(prefs);
    expect(await engine.optimizeCart([1], 10)).toEqual([]);
  });
});
