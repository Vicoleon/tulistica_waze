import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../_core/map", () => ({
  isMapsAvailable: vi.fn(() => true),
  getMapsMode: vi.fn(() => "google-direct"),
  placesApiRequest: vi.fn(),
  makeRequest: vi.fn(),
}));

import { placesApiRequest, makeRequest } from "../_core/map";
import { searchNearbyGroceryStores, getPlaceDetails, searchStoresByText } from "./externalApis";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchNearbyGroceryStores (Places API New)", () => {
  it("maps the New API response to PlaceResult and uses placesApiRequest (not legacy)", async () => {
    vi.mocked(placesApiRequest).mockResolvedValue({
      places: [
        {
          id: "abc",
          displayName: { text: "Walmart Escazú" },
          formattedAddress: "Escazú, San José",
          location: { latitude: 9.92, longitude: -84.14 },
          rating: 4.3,
          userRatingCount: 1200,
          types: ["supermarket"],
          currentOpeningHours: { openNow: true },
          priceLevel: "PRICE_LEVEL_MODERATE",
        },
      ],
    } as any);

    const result = await searchNearbyGroceryStores(9.93, -84.08, 5000);

    expect(makeRequest).not.toHaveBeenCalled();
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      placeId: "abc",
      name: "Walmart Escazú",
      address: "Escazú, San José",
      latitude: 9.92,
      longitude: -84.14,
      rating: 4.3,
      userRatingsTotal: 1200,
      openNow: true,
      priceLevel: 2,
    });
    // Verify request shape: POST searchNearby with circle restriction.
    const arg = vi.mocked(placesApiRequest).mock.calls[0][0];
    expect(arg.method).toBe("POST");
    expect(arg.path).toContain("searchNearby");
    expect((arg.body as any).locationRestriction.circle.radius).toBe(5000);
  });

  it("returns [] (no throw) when the API errors", async () => {
    vi.mocked(placesApiRequest).mockRejectedValue(new Error("403 blocked"));
    const result = await searchNearbyGroceryStores(9.93, -84.08, 5000);
    expect(result).toEqual([]);
  });

  it("clamps radius to 50000 meters", async () => {
    vi.mocked(placesApiRequest).mockResolvedValue({ places: [] } as any);
    await searchNearbyGroceryStores(9.93, -84.08, 99999);
    const arg = vi.mocked(placesApiRequest).mock.calls[0][0];
    expect((arg.body as any).locationRestriction.circle.radius).toBe(50000);
  });
});

describe("getPlaceDetails (Places API New)", () => {
  it("maps a single New place via GET details", async () => {
    vi.mocked(placesApiRequest).mockResolvedValue({
      id: "xyz",
      displayName: { text: "MaxiPalí Centro" },
      formattedAddress: "San José",
      location: { latitude: 9.93, longitude: -84.08 },
      nationalPhoneNumber: "2222-2222",
      websiteUri: "https://maxipali.co.cr",
      priceLevel: "PRICE_LEVEL_INEXPENSIVE",
    } as any);

    const result = await getPlaceDetails("xyz");

    expect(result).toMatchObject({
      placeId: "xyz",
      name: "MaxiPalí Centro",
      phone: "2222-2222",
      website: "https://maxipali.co.cr",
      priceLevel: 1,
    });
    const arg = vi.mocked(placesApiRequest).mock.calls[0][0];
    expect(arg.method).toBe("GET");
    expect(arg.path).toContain("/v1/places/xyz");
  });
});

describe("searchStoresByText (Places API New)", () => {
  it("posts a textQuery and maps results", async () => {
    vi.mocked(placesApiRequest).mockResolvedValue({
      places: [{ id: "t1", displayName: { text: "Auto Mercado" }, location: { latitude: 9.9, longitude: -84.1 } }],
    } as any);

    const result = await searchStoresByText("auto mercado", 9.93, -84.08);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Auto Mercado");
    const arg = vi.mocked(placesApiRequest).mock.calls[0][0];
    expect(arg.path).toContain("searchText");
    expect((arg.body as any).textQuery).toContain("auto mercado");
    expect((arg.body as any).locationBias.circle.center.latitude).toBe(9.93);
  });
});
