import { getNearbyStores, getPriceMatrix, getProductsByIds } from "../db";

interface StoreWithDistance {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
}

interface OptimizationResult {
  type: "SINGLE" | "SPLIT";
  stores: { id: number; name: string; distanceKm: number; items: number[] }[];
  cartTotal: number;
  tripCost: number;
  grandTotal: number;
  savings?: number;
  itemBreakdown: { productId: number; productName: string; storeId: number; storeName: string; price: number }[];
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
    // 1. Get nearby stores
    const nearbyStores = await getNearbyStores(this.userLat, this.userLon, radiusKm);
    if (nearbyStores.length === 0) {
      return [];
    }

    // 2. Get products info
    const products = await getProductsByIds(productIds);
    const productMap = new Map(products.map(p => [p.id, p]));

    // 3. Get price matrix
    const storeIds = nearbyStores.map(s => s.id);
    const priceData = await getPriceMatrix(storeIds, productIds);

    // Build price matrix: { storeId: { productId: price } }
    const priceMatrix: Map<number, Map<number, number>> = new Map();
    for (const store of nearbyStores) {
      priceMatrix.set(store.id, new Map());
    }
    for (const entry of priceData) {
      const storeMap = priceMatrix.get(entry.storeId);
      if (storeMap && !storeMap.has(entry.productId)) {
        storeMap.set(entry.productId, entry.price);
      }
    }

    const results: OptimizationResult[] = [];

    // 4. Strategy A: Single Store Best Price
    const singleStoreResults: (OptimizationResult & { storeId: number })[] = [];
    const requestedItemCount = productIds.length;
    // Drop stores that miss more than this fraction of the cart — they're
    // not realistic alternatives even if the few items they do carry are cheap.
    const MAX_MISSING_RATIO = 0.5;

    for (const store of nearbyStores) {
      const storePrices = priceMatrix.get(store.id) || new Map();
      let realCartTotal = 0; // money the user would actually pay
      const itemBreakdown: OptimizationResult["itemBreakdown"] = [];
      const missingItems: number[] = [];

      for (const productId of productIds) {
        const price = storePrices.get(productId);
        if (price !== undefined) {
          realCartTotal += price;
          itemBreakdown.push({
            productId,
            productName: productMap.get(productId)?.name || "Unknown",
            storeId: store.id,
            storeName: store.name,
            price,
          });
        } else {
          missingItems.push(productId);
        }
      }

      // Stores that miss more than half the cart aren't useful suggestions.
      if (missingItems.length / requestedItemCount > MAX_MISSING_RATIO) continue;
      // Stores with nothing matched aren't useful either.
      if (itemBreakdown.length === 0) continue;

      const roundTripDistance = store.distanceKm * 2;
      const tripCost = this.calculateTripCost(roundTripDistance);

      singleStoreResults.push({
        type: "SINGLE",
        storeId: store.id,
        stores: [
          {
            id: store.id,
            name: store.name,
            distanceKm: store.distanceKm,
            items: productIds.filter((id) => !missingItems.includes(id)),
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

    // Sort by completeness first (fewer missing items wins), then by total cost.
    singleStoreResults.sort((a, b) => {
      if (a.missingItems.length !== b.missingItems.length) {
        return a.missingItems.length - b.missingItems.length;
      }
      return a.grandTotal - b.grandTotal;
    });

    results.push(...singleStoreResults.slice(0, 5));

    // 5. Strategy B: Split List (Dual Store)
    // Only consider top 4 cheapest single stores to form pairs
    const topCandidates = singleStoreResults.slice(0, 4);

    for (let i = 0; i < topCandidates.length; i++) {
      for (let j = i + 1; j < topCandidates.length; j++) {
        const storeA = nearbyStores.find(s => s.id === topCandidates[i].storeId)!;
        const storeB = nearbyStores.find(s => s.id === topCandidates[j].storeId)!;

        const pricesA = priceMatrix.get(storeA.id) || new Map();
        const pricesB = priceMatrix.get(storeB.id) || new Map();

        let hybridTotal = 0;
        const itemBreakdown: OptimizationResult["itemBreakdown"] = [];
        const missingItems: number[] = [];
        const storeAItems: number[] = [];
        const storeBItems: number[] = [];

        for (const productId of productIds) {
          const priceA = pricesA.get(productId);
          const priceB = pricesB.get(productId);

          if (priceA === undefined && priceB === undefined) {
            missingItems.push(productId);
            continue;
          }

          // Pick the cheaper *real* price. If only one store has it, that store wins.
          const aHas = priceA !== undefined;
          const bHas = priceB !== undefined;
          const pickA = aHas && (!bHas || priceA! <= priceB!);

          if (pickA) {
            hybridTotal += priceA!;
            storeAItems.push(productId);
            itemBreakdown.push({
              productId,
              productName: productMap.get(productId)?.name || "Unknown",
              storeId: storeA.id,
              storeName: storeA.name,
              price: priceA!,
            });
          } else {
            hybridTotal += priceB!;
            storeBItems.push(productId);
            itemBreakdown.push({
              productId,
              productName: productMap.get(productId)?.name || "Unknown",
              storeId: storeB.id,
              storeName: storeB.name,
              price: priceB!,
            });
          }
        }

        if (missingItems.length / requestedItemCount > MAX_MISSING_RATIO) continue;
        if (storeAItems.length === 0 || storeBItems.length === 0) continue;

        // Calculate multi-stop route: Home -> A -> B -> Home
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
              { id: storeA.id, name: storeA.name, distanceKm: storeA.distanceKm, items: storeAItems },
              { id: storeB.id, name: storeB.name, distanceKm: storeB.distanceKm, items: storeBItems },
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

    // Final ranking: completeness first, then total cost.
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

// Points calculation for gamification
export function calculatePointsForPriceReport(
  isVerified: boolean,
  isFirstForProduct: boolean,
  userTrustScore: number
): number {
  let points = 10; // Base points
  if (isVerified) points += 5;
  if (isFirstForProduct) points += 10;
  // Bonus for high-trust users
  if (userTrustScore >= 80) points += 5;
  return points;
}
