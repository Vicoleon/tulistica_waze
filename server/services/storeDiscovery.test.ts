import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../_core/map", () => ({ isMapsAvailable: vi.fn() }));
vi.mock("./externalApis", () => ({ searchNearbyGroceryStores: vi.fn() }));
vi.mock("../db", () => ({
  cacheGooglePlace: vi.fn(),
  getNearbyGooglePlaces: vi.fn(),
  upsertPhysicalStore: vi.fn(),
}));

import { isMapsAvailable } from "../_core/map";
import { searchNearbyGroceryStores } from "./externalApis";
import { getNearbyGooglePlaces, upsertPhysicalStore } from "../db";
import { discoverPhysicalStores } from "./storeDiscovery";

const SJ = { lat: 9.9281, lng: -84.0907 };

beforeEach(() => {
  vi.clearAllMocks();
  const ids: Record<string, number> = { p2: 502, p3: 503, c1: 901 };
  vi.mocked(upsertPhysicalStore).mockImplementation(async (s: any) => ids[s.placeId] ?? 999);
});

describe("discoverPhysicalStores", () => {
  it("persists matched branches and returns them with a real id, sorted by distance", async () => {
    vi.mocked(isMapsAvailable).mockReturnValue(true);
    vi.mocked(searchNearbyGroceryStores).mockResolvedValue([
      { placeId: "p1", name: "Pulpería La Esquina", address: "x", latitude: SJ.lat, longitude: SJ.lng },
      { placeId: "p2", name: "Walmart Escazú", address: "Escazú", latitude: 9.92, longitude: -84.14 },
      { placeId: "p3", name: "MaxiPalí Centro", address: "San José", latitude: 9.93, longitude: -84.08 },
    ] as any);

    const result = await discoverPhysicalStores(SJ.lat, SJ.lng, 50);

    expect(result.map((s) => s.chainId)).toEqual(["maxipali", "walmart"]);
    expect(result.find((s) => s.placeId === "p1")).toBeUndefined();
    expect(result[0].id).toBe(503); // MaxiPalí persisted id (closest)
    expect(result[1].id).toBe(502); // Walmart persisted id
    expect(upsertPhysicalStore).toHaveBeenCalledTimes(2);
  });

  it("skips a branch when persistence returns null (no DB)", async () => {
    vi.mocked(isMapsAvailable).mockReturnValue(false);
    vi.mocked(getNearbyGooglePlaces).mockResolvedValue([
      { placeId: "c1", name: "Auto Mercado Rohrmoser", address: "Rohrmoser", latitude: 9.94, longitude: -84.13, rating: 4.5 },
    ] as any);
    vi.mocked(upsertPhysicalStore).mockResolvedValue(null);

    const result = await discoverPhysicalStores(SJ.lat, SJ.lng, 50);

    expect(result).toHaveLength(0);
  });
});
