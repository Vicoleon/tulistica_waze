import { isMapsAvailable } from "../_core/map";
import { searchNearbyGroceryStores } from "./externalApis";
import { cacheGooglePlace, getNearbyGooglePlaces } from "../db";
import { matchChain, type KnownChainId } from "./chainMatch";

export interface PhysicalStore {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  chainId: KnownChainId;
  distanceKm: number;
  avgRating: number | null;
}

interface RawPlace {
  placeId: string;
  name: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  rating?: number | null;
  userRatingsTotal?: number | null;
  priceLevel?: number | null;
  types?: string[] | null;
  openNow?: boolean | null;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Discover nearby PHYSICAL grocery branches via Google Places, matched to a
 * known chain. Online storefronts are never returned. When Maps is unavailable
 * (e.g. local dev without an API key) we degrade to whatever is cached.
 */
export async function discoverPhysicalStores(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<PhysicalStore[]> {
  let raw: RawPlace[] = [];

  if (isMapsAvailable()) {
    const places = await searchNearbyGroceryStores(lat, lng, radiusKm * 1000);
    for (const p of places) {
      await cacheGooglePlace({
        placeId: p.placeId,
        name: p.name,
        address: p.address,
        latitude: p.latitude,
        longitude: p.longitude,
        rating: p.rating,
        userRatingsTotal: p.userRatingsTotal,
        priceLevel: p.priceLevel,
        types: p.types,
        openNow: p.openNow,
      });
    }
    raw = places as RawPlace[];
  } else {
    raw = (await getNearbyGooglePlaces(lat, lng, radiusKm)) as RawPlace[];
  }

  const result: PhysicalStore[] = [];
  for (const p of raw) {
    const chainId = matchChain(p.name);
    if (!chainId) continue;
    const distanceKm = haversineKm(lat, lng, p.latitude, p.longitude);
    if (distanceKm > radiusKm) continue;
    result.push({
      placeId: p.placeId,
      name: p.name,
      address: p.address ?? "",
      latitude: p.latitude,
      longitude: p.longitude,
      chainId,
      distanceKm,
      avgRating: p.rating ?? null,
    });
  }
  result.sort((a, b) => a.distanceKm - b.distanceKm);
  return result;
}
