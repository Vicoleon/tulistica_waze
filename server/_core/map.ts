/**
 * Google Maps Platform integration.
 *
 * Calls the official Google Maps APIs directly. Requires GOOGLE_MAPS_API_KEY.
 *
 * Legacy Forge-proxy support is preserved as a fallback for existing
 * Manus deployments: if GOOGLE_MAPS_API_KEY is missing but BUILT_IN_FORGE_API_URL
 * and BUILT_IN_FORGE_API_KEY are set, requests route through the Forge proxy.
 */

import { ENV } from "./env";

export type Mode = "google-direct" | "forge-proxy" | "disabled";

function detectMode(): Mode {
  if (process.env.GOOGLE_MAPS_API_KEY) return "google-direct";
  if (ENV.forgeApiUrl && ENV.forgeApiKey) return "forge-proxy";
  return "disabled";
}

export function isMapsAvailable(): boolean {
  return detectMode() !== "disabled";
}

interface RequestOptions {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}

export async function makeRequest<T = unknown>(
  endpoint: string,
  params: Record<string, unknown> = {},
  options: RequestOptions = {}
): Promise<T> {
  const mode = detectMode();

  if (mode === "disabled") {
    throw new Error(
      "Maps API unavailable: set GOOGLE_MAPS_API_KEY (preferred) or BUILT_IN_FORGE_API_URL+BUILT_IN_FORGE_API_KEY."
    );
  }

  let url: URL;
  if (mode === "google-direct") {
    const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    url = new URL(`https://maps.googleapis.com${path}`);
    url.searchParams.append("key", process.env.GOOGLE_MAPS_API_KEY!);
  } else {
    const baseUrl = ENV.forgeApiUrl.replace(/\/+$/, "");
    url = new URL(`${baseUrl}/v1/maps/proxy${endpoint}`);
    url.searchParams.append("key", ENV.forgeApiKey);
  }

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Maps API request failed (${response.status} ${response.statusText}): ${errorText}`
    );
  }

  return (await response.json()) as T;
}

/** Current Maps integration mode (exported so callers can branch on it). */
export function getMapsMode(): Mode {
  return detectMode();
}

interface PlacesNewRequest {
  method: "GET" | "POST";
  path: string; // e.g. "/v1/places:searchNearby" or "/v1/places/{id}"
  fieldMask: string;
  body?: Record<string, unknown>;
}

/**
 * Call the Places API (New) at places.googleapis.com. Requires a direct
 * GOOGLE_MAPS_API_KEY (the Forge proxy only fronts the legacy Maps endpoints).
 * The API key goes in the X-Goog-Api-Key header; fields are selected via
 * X-Goog-FieldMask.
 */
export async function placesApiRequest<T = unknown>({
  method,
  path,
  fieldMask,
  body,
}: PlacesNewRequest): Promise<T> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    throw new Error("Places API (New) requires GOOGLE_MAPS_API_KEY");
  }
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`https://places.googleapis.com${normalized}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": fieldMask,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Places API (New) request failed (${response.status} ${response.statusText}): ${errorText}`
    );
  }
  return (await response.json()) as T;
}

// ============================================================================
// Type Definitions (subset used by callers)
// ============================================================================

export type LatLng = { lat: number; lng: number };

export type PlacesSearchResult = {
  results: Array<{
    place_id: string;
    name: string;
    formatted_address?: string;
    vicinity?: string;
    geometry: { location: LatLng };
    rating?: number;
    user_ratings_total?: number;
    business_status?: string;
    types: string[];
    opening_hours?: { open_now?: boolean };
    price_level?: number;
  }>;
  status: string;
};

export type PlaceDetailsResult = {
  result?: {
    place_id: string;
    name: string;
    formatted_address: string;
    formatted_phone_number?: string;
    website?: string;
    rating?: number;
    user_ratings_total?: number;
    opening_hours?: { open_now?: boolean; weekday_text?: string[] };
    geometry: { location: LatLng };
    price_level?: number;
    types?: string[];
  };
  status: string;
};

export type GeocodingResult = {
  results: Array<{
    address_components: Array<{ long_name: string; short_name: string; types: string[] }>;
    formatted_address: string;
    geometry: { location: LatLng; location_type: string };
    place_id: string;
    types: string[];
  }>;
  status: string;
};
