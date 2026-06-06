import { getProductsByIds, getBranchPriceMatrix } from "../db";
import { discoverPhysicalStores } from "./storeDiscovery";

interface OptimizationResult {
  type: "SINGLE" | "SPLIT";
  stores: {
    id: number;
    name: string;
    distanceKm: number;
    items: number[];
    address?: string;
    chainId?: string;
    placeId?: string;
    latitude?: number;
    longitude?: number;
  }[];
  cartTotal: number;
  tripCost: number;
  grandTotal: number;
  savings?: number;
  itemBreakdown: { productId: number; productName: string; storeId: number; storeName: string; price: number; source: "reported" | "estimated" }[];
  missingItems: number[];
  /** Total items requested by the user. */
  requestedItemCount: number;
  /** Items found at this store / combination of stores. */
  foundItemCount: number;
}

interface UserPreferences {
  fuelCostPerKm: number;
  timeValuePerHour: number;
  homeLatitude: number;
  homeLongitude: number;
}

// Haversine formula for distance calculation
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Estimate travel time based on distance (assuming avg 30 km/h in urban areas)
function estimateTravelTime(distanceKm: number): number {
  return (distanceKm / 30) * 60; // minutes
}

export class SmartCartEngine {
  private userLat: number;
  private userLon: number;
  private fuelCostPerKm: number;
  private timeValuePerMinute: number;

  constructor(prefs: UserPreferences) {
    this.userLat = prefs.homeLatitude;
    this.userLon = prefs.homeLongitude;
    this.fuelCostPerKm = prefs.fuelCostPerKm;
    this.timeValuePerMinute = prefs.timeValuePerHour / 60;
  }

  calculateTripCost(distanceKm: number): number {
    const timeMin = estimateTravelTime(distanceKm);
    const gasCost = distanceKm * this.fuelCostPerKm;
    const timeCost = timeMin * this.timeValuePerMinute;
    return gasCost + timeCost;
  }

  async optimizeCart(productIds: number[], radiusKm: number): Promise<OptimizationResult[]> {
    // 1. Discover nearby PHYSICAL branches (Google Places), matched to a chain.
    const physical = await discoverPhysicalStores(this.userLat, this.userLon, radiusKm);
    if (physical.length === 0) {
      return [];
    }

    // 2. Products info.
    const products = await getProductsByIds(productIds);
    const productMap = new Map(products.map((p) => [p.id, p]));

    // 3. Candidate branches (all persisted physical branches matched to a chain).
    interface StoreCandidate {
      id: number; // real persisted store id of the branch
      placeId: string;
      name: string;
      address: string;
      chainId: string;
      latitude: number;
      longitude: number;
      distanceKm: number;
    }
    const candidates: StoreCandidate[] = physical.map((p) => ({
      id: p.id,
      placeId: p.placeId,
      name: p.name,
      address: p.address,
      chainId: p.chainId,
      latitude: p.latitude,
      longitude: p.longitude,
      distanceKm: p.distanceKm,
    }));
    if (candidates.length === 0) {
      return [];
    }

    // 4. Resolve prices per (branch, product): branch's own > chain online > estimate.
    type PricedEntry = { price: number; source: "reported" | "estimated" };
    const branchPriceData = await getBranchPriceMatrix(
      candidates.map((c) => ({ storeId: c.id, chainId: c.chainId })),
      productIds,
    );
    const placeIdByStoreId = new Map(candidates.map((c) => [c.id, c.placeId]));
    // Price matrix keyed by placeId so branches stay distinct.
    const priceMatrix = new Map<string, Map<number, PricedEntry>>();
    for (const c of candidates) priceMatrix.set(c.placeId, new Map());
    for (const entry of branchPriceData) {
      const placeId = placeIdByStoreId.get(entry.storeId);
      if (!placeId) continue;
      const m = priceMatrix.get(placeId)!;
      if (!m.has(entry.productId)) {
        m.set(entry.productId, { price: entry.price, source: entry.source });
      }
    }

    const results: OptimizationResult[] = [];
    const requestedItemCount = productIds.length;
    const MAX_MISSING_RATIO = 0.5;

    // 5. Strategy A: Single Store Best Price.
    const singleStoreResults: (OptimizationResult & { placeId: string })[] = [];

    for (const store of candidates) {
      const storePrices = priceMatrix.get(store.placeId) || new Map<number, PricedEntry>();
      let realCartTotal = 0;
      const itemBreakdown: OptimizationResult["itemBreakdown"] = [];
      const missingItems: number[] = [];

      for (const productId of productIds) {
        const entry = storePrices.get(productId);
        if (entry !== undefined) {
          realCartTotal += entry.price;
          itemBreakdown.push({
            productId,
            productName: productMap.get(productId)?.name || "Unknown",
            storeId: store.id,
            storeName: store.name,
            price: entry.price,
            source: entry.source,
          });
        } else {
          missingItems.push(productId);
        }
      }

      if (missingItems.length / requestedItemCount > MAX_MISSING_RATIO) continue;
      if (itemBreakdown.length === 0) continue;

      const roundTripDistance = store.distanceKm * 2;
      const tripCost = this.calculateTripCost(roundTripDistance);

      singleStoreResults.push({
        type: "SINGLE",
        placeId: store.placeId,
        stores: [
          {
            id: store.id,
            name: store.name,
            distanceKm: store.distanceKm,
            items: productIds.filter((id) => !missingItems.includes(id)),
            address: store.address,
            chainId: store.chainId,
            placeId: store.placeId,
            latitude: store.latitude,
            longitude: store.longitude,
          },
        ],
        cartTotal: Math.round(realCartTotal * 100) / 100,
        tripCost: Math.round(tripCost * 100) / 100,
        grandTotal: Math.round((realCartTotal + tripCost) * 100) / 100,
        itemBreakdown,
        missingItems,
        requestedItemCount,
        foundItemCount: itemBreakdown.length,
      });
    }

    singleStoreResults.sort((a, b) => {
      if (a.missingItems.length !== b.missingItems.length) {
        return a.missingItems.length - b.missingItems.length;
      }
      return a.grandTotal - b.grandTotal;
    });

    results.push(...singleStoreResults.slice(0, 5));

    // 6. Strategy B: Split List (Dual Store) over the top single-store candidates.
    const topCandidates = singleStoreResults.slice(0, 4);

    for (let i = 0; i < topCandidates.length; i++) {
      for (let j = i + 1; j < topCandidates.length; j++) {
        const storeA = candidates.find((c) => c.placeId === topCandidates[i].placeId)!;
        const storeB = candidates.find((c) => c.placeId === topCandidates[j].placeId)!;

        const pricesA = priceMatrix.get(storeA.placeId) || new Map<number, PricedEntry>();
        const pricesB = priceMatrix.get(storeB.placeId) || new Map<number, PricedEntry>();

        let hybridTotal = 0;
        const itemBreakdown: OptimizationResult["itemBreakdown"] = [];
        const missingItems: number[] = [];
        const storeAItems: number[] = [];
        const storeBItems: number[] = [];

        for (const productId of productIds) {
          const entryA = pricesA.get(productId);
          const entryB = pricesB.get(productId);

          if (entryA === undefined && entryB === undefined) {
            missingItems.push(productId);
            continue;
          }

          // Pick the cheaper price. If only one store has it, that store wins.
          const aHas = entryA !== undefined;
          const bHas = entryB !== undefined;
          const pickA = aHas && (!bHas || entryA!.price <= entryB!.price);

          if (pickA) {
            hybridTotal += entryA!.price;
            storeAItems.push(productId);
            itemBreakdown.push({
              productId,
              productName: productMap.get(productId)?.name || "Unknown",
              storeId: storeA.id,
              storeName: storeA.name,
              price: entryA!.price,
              source: entryA!.source,
            });
          } else {
            hybridTotal += entryB!.price;
            storeBItems.push(productId);
            itemBreakdown.push({
              productId,
              productName: productMap.get(productId)?.name || "Unknown",
              storeId: storeB.id,
              storeName: storeB.name,
              price: entryB!.price,
              source: entryB!.source,
            });
          }
        }

        if (missingItems.length / requestedItemCount > MAX_MISSING_RATIO) continue;
        if (storeAItems.length === 0 || storeBItems.length === 0) continue;

        const distHomeToA = storeA.distanceKm;
        const distAToB = calculateDistance(storeA.latitude, storeA.longitude, storeB.latitude, storeB.longitude);
        const distBToHome = storeB.distanceKm;
        const totalDistance = distHomeToA + distAToB + distBToHome;
        const tripCost = this.calculateTripCost(totalDistance);

        const grandTotal = hybridTotal + tripCost;
        const bestSingleTotal = topCandidates[0].cartTotal + topCandidates[0].tripCost;
        const savings = bestSingleTotal - grandTotal;

        if (savings > 0.5) {
          results.push({
            type: "SPLIT",
            stores: [
              {
                id: storeA.id,
                name: storeA.name,
                distanceKm: storeA.distanceKm,
                items: storeAItems,
                address: storeA.address,
                chainId: storeA.chainId,
                placeId: storeA.placeId,
                latitude: storeA.latitude,
                longitude: storeA.longitude,
              },
              {
                id: storeB.id,
                name: storeB.name,
                distanceKm: storeB.distanceKm,
                items: storeBItems,
                address: storeB.address,
                chainId: storeB.chainId,
                placeId: storeB.placeId,
                latitude: storeB.latitude,
                longitude: storeB.longitude,
              },
            ],
            cartTotal: Math.round(hybridTotal * 100) / 100,
            tripCost: Math.round(tripCost * 100) / 100,
            grandTotal: Math.round(grandTotal * 100) / 100,
            savings: Math.round(savings * 100) / 100,
            itemBreakdown,
            missingItems,
            requestedItemCount,
            foundItemCount: itemBreakdown.length,
          });
        }
      }
    }

    results.sort((a, b) => {
      if (a.missingItems.length !== b.missingItems.length) {
        return a.missingItems.length - b.missingItems.length;
      }
      return a.grandTotal - b.grandTotal;
    });

    return results.slice(0, 10);
  }
}

// Geofence validation helper
export function validateGeofence(
  userLat: number,
  userLon: number,
  storeLat: number,
  storeLon: number,
  maxDistanceMeters = 100
): boolean {
  const distance = calculateDistance(userLat, userLon, storeLat, storeLon) * 1000; // Convert to meters
  return distance <= maxDistanceMeters;
}

// Z-score outlier detection
export function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return Math.abs((value - mean) / stdDev);
}

export function isOutlierPrice(price: number, avgPrice: number, stdDev: number, threshold = 2.5): boolean {
  const zScore = calculateZScore(price, avgPrice, stdDev);
  return zScore > threshold;
}

// Trust score calculation
export function calculateTrustScoreChange(
  isVerified: boolean,
  wasDisputed: boolean,
  currentScore: number
): number {
  if (wasDisputed) {
    return -10; // Penalty for disputed price
  }
  if (isVerified) {
    return Math.min(1, (100 - currentScore) * 0.1); // Diminishing returns as score increases
  }
  return 0;
}

export function shouldRequireConfirmation(trustScore: number): boolean {
  return trustScore < 30;
}

// Base points for a price report. The "new product" bonus is applied by the
// caller via the points ledger (deduped per user+product) — do NOT add it here.
export function calculatePointsForPriceReport(
  isVerified: boolean,
  userTrustScore: number
): number {
  let points = 10; // Base points
  if (isVerified) points += 5;
  // Bonus for high-trust users
  if (userTrustScore >= 80) points += 5;
  return points;
}
