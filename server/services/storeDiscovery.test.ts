import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../_core/map", () => ({ isMapsAvailable: vi.fn() }));
vi.mock("./externalApis", () => ({ searchNearbyGroceryStores: vi.fn() }));
vi.mock("../db", () => ({
  cacheGooglePlace: vi.fn(),
  getNearbyGooglePlaces: vi.fn(),
}));

import { isMapsAvailable } from "../_core/map";
import { searchNearbyGroceryStores } from "./externalApis";
import { getNearbyGooglePlaces } from "../db";
import { discoverPhysicalStores } from "./storeDiscovery";

const SJ = { lat: 9.9281, lng: -84.0907 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("discoverPhysicalStores", () => {
  it("keeps only stores that match a known chain and sorts by distance", async () => {
    vi.mocked(isMapsAvailable).mockReturnValue(true);
    vi.mocked(searchNearbyGroceryStores).mockResolvedValue([
      { placeId: "p1", name: "Pulpería La Esquina", address: "x", latitude: SJ.lat, longitude: SJ.lng },
      { placeId: "p2", name: "Walmart Escazú", address: "Escazú", latitude: 9.92, longitude: -84.14 },
      { placeId: "p3", name: "MaxiPalí Centro", address: "San José", latitude: 9.93, longitude: -84.08 },
    ] as any);

    const result = await discoverPhysicalStores(SJ.lat, SJ.lng, 50);

    expect(result.map((s) => s.chainId)).toEqual(["maxipali", "walmart"]);
    expect(result.find((s) => s.placeId === "p1")).toBeUndefined();
    expect(result[0].distanceKm).toBeLessThanOrEqual(result[1].distanceKm);
  });

  it("falls back to cached places when Maps is unavailable", async () => {
    vi.mocked(isMapsAvailable).mockReturnValue(false);
    vi.mocked(getNearbyGooglePlaces).mockResolvedValue([
      { placeId: "c1", name: "Auto Mercado Rohrmoser", address: "Rohrmoser", latitude: 9.94, longitude: -84.13, rating: 4.5 },
    ] as any);

    const result = await discoverPhysicalStores(SJ.lat, SJ.lng, 50);

    expect(searchNearbyGroceryStores).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0].chainId).toBe("automercado");
    expect(result[0].avgRating).toBe(4.5);
  });
});
