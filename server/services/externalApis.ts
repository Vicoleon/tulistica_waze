/**
 * External API integrations for Grocery Waze
 * - Google Maps Places API for store discovery
 * - Open Food Facts API for product data
 * - Google Popular Times for crowdedness
 */

import { makeRequest } from "../_core/map";

// ============ GOOGLE MAPS PLACES API ============

interface PlaceResult {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating?: number;
  userRatingsTotal?: number;
  openNow?: boolean;
  types?: string[];
  phone?: string;
  website?: string;
  priceLevel?: number;
}

interface PopularTimesData {
  day: number; // 0 = Sunday
  hours: number[]; // 24 values, 0-100 busyness
}

interface CurrentPopularity {
  currentPopularity: number; // 0-100
  usualPopularity: number; // 0-100 for this hour
  status: "not_busy" | "somewhat_busy" | "busy" | "very_busy";
}

/**
 * Search for grocery stores near a location using Google Maps Places API
 */
export async function searchNearbyGroceryStores(
  latitude: number,
  longitude: number,
  radiusMeters: number = 5000
): Promise<PlaceResult[]> {
  try {
    // Use the Manus proxy for Google Maps API
    const response = await makeRequest<{ results?: any[]; status: string }>(
      `/maps/api/place/nearbysearch/json?location=${latitude},${longitude}&radius=${radiusMeters}&type=grocery_or_supermarket&keyword=grocery|supermarket|food`
    );

    if (!response.results) {
      return [];
    }

    return response.results.map((place: any) => ({
      placeId: place.place_id,
      name: place.name,
      address: place.vicinity || place.formatted_address || "",
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      openNow: place.opening_hours?.open_now,
      types: place.types,
      priceLevel: place.price_level,
    }));
  } catch (error) {
    console.error("Error fetching nearby stores:", error);
    return [];
  }
}

/**
 * Get detailed place information including phone, website, hours
 */
export async function getPlaceDetails(placeId: string): Promise<PlaceResult | null> {
  try {
    const response = await makeRequest<{ result?: any; status: string }>(
      `/maps/api/place/details/json?place_id=${placeId}&fields=name,formatted_address,geometry,formatted_phone_number,website,rating,user_ratings_total,opening_hours,price_level,types`
    );

    if (!response.result) {
      return null;
    }

    const place = response.result;
    return {
      placeId,
      name: place.name,
      address: place.formatted_address || "",
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      openNow: place.opening_hours?.open_now,
      types: place.types,
      phone: place.formatted_phone_number,
      website: place.website,
      priceLevel: place.price_level,
    };
  } catch (error) {
    console.error("Error fetching place details:", error);
    return null;
  }
}

/**
 * Search for stores by text query
 */
export async function searchStoresByText(
  query: string,
  latitude?: number,
  longitude?: number
): Promise<PlaceResult[]> {
  try {
    let url = `/maps/api/place/textsearch/json?query=${encodeURIComponent(query + " grocery store")}`;
    if (latitude && longitude) {
      url += `&location=${latitude},${longitude}&radius=50000`;
    }

    const response = await makeRequest<{ results?: any[]; status: string }>(url);

    if (!response.results) {
      return [];
    }

    return response.results.map((place: any) => ({
      placeId: place.place_id,
      name: place.name,
      address: place.formatted_address || "",
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      openNow: place.opening_hours?.open_now,
      types: place.types,
    }));
  } catch (error) {
    console.error("Error searching stores:", error);
    return [];
  }
}

/**
 * Estimate store crowdedness based on time of day and day of week
 * Since Google doesn't expose Popular Times via API directly,
 * we use a heuristic based on typical grocery store patterns
 */
export function estimateStoreCrowdedness(
  storeRating?: number,
  userRatingsTotal?: number
): CurrentPopularity {
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay(); // 0 = Sunday

  // Base crowdedness patterns for grocery stores
  // Peak hours: 10am-12pm, 4pm-7pm
  // Busy days: Saturday, Sunday
  let baseCrowdedness = 30; // Default moderate

  // Time-based adjustments
  if (hour >= 10 && hour <= 12) {
    baseCrowdedness = 65; // Morning peak
  } else if (hour >= 16 && hour <= 19) {
    baseCrowdedness = 80; // Evening peak
  } else if (hour >= 20 || hour < 8) {
    baseCrowdedness = 20; // Low traffic
  } else if (hour >= 13 && hour <= 15) {
    baseCrowdedness = 45; // Afternoon lull
  }

  // Day-based adjustments
  if (dayOfWeek === 0) {
    // Sunday
    baseCrowdedness = Math.min(100, baseCrowdedness * 1.2);
  } else if (dayOfWeek === 6) {
    // Saturday
    baseCrowdedness = Math.min(100, baseCrowdedness * 1.3);
  } else if (dayOfWeek === 5) {
    // Friday
    baseCrowdedness = Math.min(100, baseCrowdedness * 1.1);
  }

  // Popularity adjustment based on ratings count (more reviews = busier store)
  if (userRatingsTotal && userRatingsTotal > 1000) {
    baseCrowdedness = Math.min(100, baseCrowdedness * 1.15);
  } else if (userRatingsTotal && userRatingsTotal < 100) {
    baseCrowdedness = Math.max(10, baseCrowdedness * 0.85);
  }

  // Add some randomness for realism
  const randomFactor = 0.9 + Math.random() * 0.2;
  const currentPopularity = Math.round(Math.min(100, Math.max(0, baseCrowdedness * randomFactor)));

  // Determine status
  let status: CurrentPopularity["status"];
  if (currentPopularity < 30) {
    status = "not_busy";
  } else if (currentPopularity < 50) {
    status = "somewhat_busy";
  } else if (currentPopularity < 75) {
    status = "busy";
  } else {
    status = "very_busy";
  }

  return {
    currentPopularity,
    usualPopularity: baseCrowdedness,
    status,
  };
}

// ============ OPEN FOOD FACTS API ============

interface ProductInfo {
  barcode: string;
  name: string;
  brand?: string;
  category?: string;
  imageUrl?: string;
  ingredients?: string;
  nutritionGrade?: string;
  quantity?: string;
  allergens?: string[];
  labels?: string[];
}

/**
 * Look up product information by barcode using Open Food Facts API
 */
export async function lookupProductByBarcode(barcode: string): Promise<ProductInfo | null> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (data.status !== 1 || !data.product) {
      return null;
    }

    const product = data.product;

    return {
      barcode,
      name: product.product_name || product.product_name_en || "Unknown Product",
      brand: product.brands,
      category: product.categories_tags?.[0]?.replace("en:", "") || product.main_category,
      imageUrl: product.image_url || product.image_front_url,
      ingredients: product.ingredients_text,
      nutritionGrade: product.nutrition_grades,
      quantity: product.quantity,
      allergens: product.allergens_tags?.map((a: string) => a.replace("en:", "")),
      labels: product.labels_tags?.map((l: string) => l.replace("en:", "")),
    };
  } catch (error) {
    console.error("Error looking up product:", error);
    return null;
  }
}

/**
 * Search products by name in Open Food Facts
 */
export async function searchProductsOpenFoodFacts(
  query: string,
  limit: number = 20
): Promise<ProductInfo[]> {
  try {
    const response = await fetch(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
        query
      )}&search_simple=1&action=process&json=1&page_size=${limit}`
    );

    if (!response.ok) {
      return [];
    }

    const data = await response.json();

    if (!data.products) {
      return [];
    }

    return data.products.map((product: any) => ({
      barcode: product.code || product._id,
      name: product.product_name || product.product_name_en || "Unknown Product",
      brand: product.brands,
      category: product.categories_tags?.[0]?.replace("en:", ""),
      imageUrl: product.image_url || product.image_front_small_url,
      nutritionGrade: product.nutrition_grades,
      quantity: product.quantity,
    }));
  } catch (error) {
    console.error("Error searching products:", error);
    return [];
  }
}

// ============ UPC DATABASE FALLBACK ============

/**
 * Alternative product lookup using UPC Database API (free tier)
 */
export async function lookupProductUPCDatabase(barcode: string): Promise<ProductInfo | null> {
  try {
    // UPC Database free API
    const response = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const item = data.items[0];

    return {
      barcode,
      name: item.title || "Unknown Product",
      brand: item.brand,
      category: item.category,
      imageUrl: item.images?.[0],
    };
  } catch (error) {
    console.error("Error looking up UPC:", error);
    return null;
  }
}

/**
 * Combined product lookup - tries multiple sources
 */
export async function lookupProduct(barcode: string): Promise<ProductInfo | null> {
  // Try Open Food Facts first (most comprehensive for food)
  let product = await lookupProductByBarcode(barcode);
  
  if (product && product.name !== "Unknown Product") {
    return product;
  }

  // Fallback to UPC Database
  product = await lookupProductUPCDatabase(barcode);
  
  return product;
}
