# Tiendas físicas con precio base en línea — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El optimizador y el buscador recomiendan sucursales físicas reales (Google Places), usando el precio en línea de la cadena como base; nunca recomiendan tiendas "(en línea)".

**Architecture:** Tres unidades puras/de servicio nuevas — `chainMatch` (nombre→cadena), `storeDiscovery` (Places→sucursales físicas emparejadas a cadena, con caché/fallback), y un helper en `db.ts` que mapea cadena→tienda en línea. `smartCart.optimizeCart` y `stores.getNearby` pasan a operar sobre sucursales físicas; el precio de cada sucursal sale de la tienda en línea de su cadena.

**Tech Stack:** TypeScript, tRPC, Drizzle (MySQL), Vitest, React.

---

## File Structure

- **Create** `server/services/chainMatch.ts` — funciones puras: `matchChain`, `isOnlineStoreName`, tipo `KnownChainId`, `KNOWN_CHAINS`.
- **Create** `server/services/chainMatch.test.ts` — unit tests de las funciones puras.
- **Create** `server/services/storeDiscovery.ts` — `discoverPhysicalStores` + tipo `PhysicalStore`.
- **Create** `server/services/storeDiscovery.test.ts` — unit tests con `db` y `externalApis` mockeados.
- **Modify** `server/db.ts` — nuevo helper `getOnlineStoreIdsByChain`.
- **Modify** `server/services/smartCart.ts` — reescribir `optimizeCart` y el tipo `OptimizationResult.stores`.
- **Modify** `server/services/smartCart.test.ts` (nuevo si no existe) — tests del optimizador con sucursales físicas.
- **Modify** `server/routers.ts` — `stores.getNearby` usa `discoverPhysicalStores`; `stores.search` filtra tiendas en línea.
- **Modify** `client/src/pages/Optimize.tsx` — revertir etiqueta "Compra en línea"; mostrar dirección física.
- **Modify** `client/src/pages/Stores.tsx` — `key` por `placeId`.
- **Modify** `client/src/pages/MapView.tsx` — id de marcador por `placeId`.

---

### Task 1: `chainMatch` — funciones puras de clasificación

**Files:**
- Create: `server/services/chainMatch.ts`
- Test: `server/services/chainMatch.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/services/chainMatch.test.ts
import { describe, expect, it } from "vitest";
import { matchChain, isOnlineStoreName } from "./chainMatch";

describe("chainMatch.matchChain", () => {
  it("matches Walmart branches", () => {
    expect(matchChain("Walmart Escazú")).toBe("walmart");
  });

  it("matches MaxiPalí with and without accent", () => {
    expect(matchChain("MaxiPalí Guadalupe")).toBe("maxipali");
    expect(matchChain("Maxi Pali Heredia")).toBe("maxipali");
  });

  it("matches Más x Menos, Auto Mercado, PriceSmart, MegaSuper", () => {
    expect(matchChain("Más x Menos San Pedro")).toBe("masxmenos");
    expect(matchChain("Auto Mercado Rohrmoser")).toBe("automercado");
    expect(matchChain("PriceSmart Tibás")).toBe("pricesmart");
    expect(matchChain("MegaSuper Cartago")).toBe("megasuper");
  });

  it("returns null for unknown chains", () => {
    expect(matchChain("Pulpería La Esquina")).toBeNull();
    expect(matchChain("Fresh Market")).toBeNull();
  });
});

describe("chainMatch.isOnlineStoreName", () => {
  it("detects the (en línea) suffix", () => {
    expect(isOnlineStoreName("MaxiPalí (en línea)")).toBe(true);
    expect(isOnlineStoreName("Walmart (en linea)")).toBe(true);
  });

  it("is false for physical store names", () => {
    expect(isOnlineStoreName("Walmart Escazú")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/chainMatch.test.ts`
Expected: FAIL — cannot find module `./chainMatch`.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/services/chainMatch.ts

/** Chains for which we currently have an online "base" price. */
export type KnownChainId =
  | "walmart"
  | "maxipali"
  | "masxmenos"
  | "automercado"
  | "pricesmart"
  | "megasuper";

export const KNOWN_CHAINS: KnownChainId[] = [
  "walmart",
  "maxipali",
  "masxmenos",
  "automercado",
  "pricesmart",
  "megasuper",
];

// Order: more specific brands before generic ones. MaxiPalí does not contain
// "walmart" in its name, so order is not strictly required, but kept explicit.
const CHAIN_PATTERNS: { chainId: KnownChainId; pattern: RegExp }[] = [
  { chainId: "maxipali", pattern: /maxi\s*pal[íi]/i },
  { chainId: "masxmenos", pattern: /m[áa]s\s*x\s*menos|masxmenos/i },
  { chainId: "automercado", pattern: /auto\s*mercado/i },
  { chainId: "pricesmart", pattern: /price\s*smart/i },
  { chainId: "megasuper", pattern: /mega\s*super/i },
  { chainId: "walmart", pattern: /walmart/i },
];

/** Map a Google Places store name to a known chainId, or null if unknown. */
export function matchChain(placeName: string): KnownChainId | null {
  for (const { chainId, pattern } of CHAIN_PATTERNS) {
    if (pattern.test(placeName)) return chainId;
  }
  return null;
}

/** True when a store row is one of our virtual online storefronts. */
export function isOnlineStoreName(name: string): boolean {
  return /\(en l[íi]nea\)/i.test(name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/services/chainMatch.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add server/services/chainMatch.ts server/services/chainMatch.test.ts
git commit -m "feat: chain matching helpers for physical store discovery"
```

---

### Task 2: `db.getOnlineStoreIdsByChain`

**Files:**
- Modify: `server/db.ts` (add helper near the store helpers, after `searchStores`)

- [ ] **Step 1: Add the import for `isOnlineStoreName`**

At the top of `server/db.ts`, with the other local imports, add:

```ts
import { isOnlineStoreName } from "./services/chainMatch";
```

(Verify there is no circular import: `chainMatch.ts` imports nothing from `db.ts`, so this is safe.)

- [ ] **Step 2: Add the helper**

Insert after the `searchStores` function (around `server/db.ts:284`):

```ts
/**
 * Map each chain to the storeId of its virtual "(en línea)" storefront.
 * These online stores hold the bootstrap/base prices for the chain. Physical
 * branches reuse these prices until per-store prices exist.
 */
export async function getOnlineStoreIdsByChain(): Promise<Map<string, number>> {
  const db = await getDb();
  const map = new Map<string, number>();
  if (!db) return map;
  const rows = await db
    .select({ id: stores.id, chainId: stores.chainId, name: stores.name })
    .from(stores)
    .where(eq(stores.isActive, true));
  for (const r of rows) {
    if (r.chainId && isOnlineStoreName(r.name) && !map.has(r.chainId)) {
      map.set(r.chainId, r.id);
    }
  }
  return map;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `db.ts` or `getOnlineStoreIdsByChain`.

- [ ] **Step 4: Commit**

```bash
git add server/db.ts
git commit -m "feat: getOnlineStoreIdsByChain helper"
```

---

### Task 3: `storeDiscovery.discoverPhysicalStores`

**Files:**
- Create: `server/services/storeDiscovery.ts`
- Test: `server/services/storeDiscovery.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// server/services/storeDiscovery.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/storeDiscovery.test.ts`
Expected: FAIL — cannot find module `./storeDiscovery`.

- [ ] **Step 3: Write the implementation**

```ts
// server/services/storeDiscovery.ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/services/storeDiscovery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/services/storeDiscovery.ts server/services/storeDiscovery.test.ts
git commit -m "feat: discoverPhysicalStores via Google Places with cache fallback"
```

---

### Task 4: Rewire `smartCart.optimizeCart` to physical stores + chain prices

**Files:**
- Modify: `server/services/smartCart.ts` (imports, `OptimizationResult` type, full `optimizeCart` body)
- Test: `server/services/smartCart.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```ts
// server/services/smartCart.test.ts
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
    // Two physical branches of different chains.
    vi.mocked(discoverPhysicalStores).mockResolvedValue([
      { placeId: "w1", name: "Walmart Escazú", address: "Escazú", latitude: 9.92, longitude: -84.14, chainId: "walmart", distanceKm: 2, avgRating: 4 },
      { placeId: "m1", name: "MaxiPalí Centro", address: "San José", latitude: 9.93, longitude: -84.08, chainId: "maxipali", distanceKm: 1, avgRating: 4 },
    ] as any);
    // walmart online store id = 10, maxipali = 20.
    vi.mocked(getOnlineStoreIdsByChain).mockResolvedValue(
      new Map([["walmart", 10], ["maxipali", 20]])
    );
    vi.mocked(getProductsByIds).mockResolvedValue([
      { id: 1, name: "Arroz" },
      { id: 2, name: "Agua" },
    ] as any);
    // Prices live on the online store ids.
    vi.mocked(getPriceMatrix).mockResolvedValue([
      { storeId: 10, productId: 1, price: 1000, isVerified: true }, // Walmart arroz
      { storeId: 10, productId: 2, price: 500, isVerified: true },  // Walmart agua
      { storeId: 20, productId: 1, price: 700, isVerified: true },  // MaxiPalí arroz
      { storeId: 20, productId: 2, price: 900, isVerified: true },  // MaxiPalí agua
    ] as any);

    const engine = new SmartCartEngine(prefs);
    const results = await engine.optimizeCart([1, 2], 10);

    expect(results.length).toBeGreaterThan(0);
    const allStoreNames = results.flatMap((r) => r.stores.map((s) => s.name));
    expect(allStoreNames.some((n) => /\(en l[íi]nea\)/i.test(n))).toBe(false);
    // Stores carry the physical address.
    const single = results.find((r) => r.type === "SINGLE")!;
    expect(single.stores[0].address).toBeTruthy();
    // MaxiPalí arroz (700) should be reflected in some breakdown entry.
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/services/smartCart.test.ts`
Expected: FAIL — `optimizeCart` still calls `getNearbyStores` (not mocked) / store names lack `address`.

- [ ] **Step 3: Update imports and the `OptimizationResult` type**

Replace the import line at `server/services/smartCart.ts:1`:

```ts
import { getPriceMatrix, getProductsByIds, getOnlineStoreIdsByChain } from "../db";
import { discoverPhysicalStores } from "./storeDiscovery";
```

Replace the `stores` field in the `OptimizationResult` interface (`server/services/smartCart.ts:13`) with:

```ts
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
```

- [ ] **Step 4: Replace the whole `optimizeCart` method**

Replace the entire `optimizeCart` method (`server/services/smartCart.ts:70-265`) with:

```ts
  async optimizeCart(productIds: number[], radiusKm: number): Promise<OptimizationResult[]> {
    // 1. Discover nearby PHYSICAL branches (Google Places), matched to a chain.
    const physical = await discoverPhysicalStores(this.userLat, this.userLon, radiusKm);
    if (physical.length === 0) {
      return [];
    }

    // 2. Products info.
    const products = await getProductsByIds(productIds);
    const productMap = new Map(products.map((p) => [p.id, p]));

    // 3. Online "base" prices, keyed by chain. Physical branches reuse the
    //    price of their chain's online storefront until per-store prices exist.
    const onlineByChain = await getOnlineStoreIdsByChain(); // chainId -> online storeId
    const onlineIdToChain = new Map<number, string>();
    for (const [chain, id] of onlineByChain) onlineIdToChain.set(id, chain);
    const onlineStoreIds = [...new Set(onlineByChain.values())];
    const priceData = await getPriceMatrix(onlineStoreIds, productIds);

    // chainId -> (productId -> price)
    const chainPrices = new Map<string, Map<number, number>>();
    for (const entry of priceData) {
      const chain = onlineIdToChain.get(entry.storeId);
      if (!chain) continue;
      if (!chainPrices.has(chain)) chainPrices.set(chain, new Map());
      const cm = chainPrices.get(chain)!;
      if (!cm.has(entry.productId)) cm.set(entry.productId, entry.price);
    }

    // 4. Candidate branches whose chain actually has base prices.
    interface StoreCandidate {
      id: number; // chain's online storeId (price source / itemBreakdown.storeId)
      placeId: string;
      name: string;
      address: string;
      chainId: string;
      latitude: number;
      longitude: number;
      distanceKm: number;
    }
    const candidates: StoreCandidate[] = physical
      .map((p) => ({
        id: onlineByChain.get(p.chainId) ?? -1,
        placeId: p.placeId,
        name: p.name,
        address: p.address,
        chainId: p.chainId,
        latitude: p.latitude,
        longitude: p.longitude,
        distanceKm: p.distanceKm,
      }))
      .filter((c) => c.id !== -1);
    if (candidates.length === 0) {
      return [];
    }

    // Price matrix keyed by placeId so two branches of the same chain stay distinct.
    const priceMatrix = new Map<string, Map<number, number>>();
    for (const c of candidates) {
      priceMatrix.set(c.placeId, chainPrices.get(c.chainId) ?? new Map());
    }

    const results: OptimizationResult[] = [];
    const requestedItemCount = productIds.length;
    const MAX_MISSING_RATIO = 0.5;

    // 5. Strategy A: Single Store Best Price.
    const singleStoreResults: (OptimizationResult & { placeId: string })[] = [];

    for (const store of candidates) {
      const storePrices = priceMatrix.get(store.placeId) || new Map<number, number>();
      let realCartTotal = 0;
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

        const pricesA = priceMatrix.get(storeA.placeId) || new Map<number, number>();
        const pricesB = priceMatrix.get(storeB.placeId) || new Map<number, number>();

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
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run server/services/smartCart.test.ts`
Expected: PASS (both cases). The `getNearbyStores` import is gone; `calculateDistance` (module-level helper) is still defined above the class.

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `smartCart.ts`.

- [ ] **Step 7: Commit**

```bash
git add server/services/smartCart.ts server/services/smartCart.test.ts
git commit -m "feat: optimize over physical branches priced from chain online base"
```

---

### Task 5: `stores.getNearby` and `stores.search` (buscador de tiendas)

**Files:**
- Modify: `server/routers.ts` (`stores.getNearby` ~`:424-432`, `stores.search` ~`:434-438`)
- Modify imports at top of `server/routers.ts`

- [ ] **Step 1: Add imports**

In `server/routers.ts`, near the existing `searchNearbyGroceryStores` import (line ~34), add:

```ts
import { discoverPhysicalStores } from "./services/storeDiscovery";
import { isOnlineStoreName } from "./services/chainMatch";
```

- [ ] **Step 2: Replace `stores.getNearby`**

Replace the body of `stores.getNearby` (`server/routers.ts:430-432`) with:

```ts
      .query(async ({ input }) => {
        const physical = await discoverPhysicalStores(
          input.latitude,
          input.longitude,
          input.radiusKm
        );
        // Shape compatible with the Stores/MapView client (store.id, name,
        // chainId, city, avgRating, latitude, longitude, distanceKm, address).
        return physical.map((s) => ({
          id: 0, // physical branches have no DB row yet; identity is placeId
          placeId: s.placeId,
          name: s.name,
          chainId: s.chainId,
          city: null as string | null,
          address: s.address,
          latitude: s.latitude,
          longitude: s.longitude,
          avgRating: s.avgRating,
          distanceKm: s.distanceKm,
        }));
      }),
```

- [ ] **Step 3: Filter online stores out of `stores.search`**

Replace the body of `stores.search` (`server/routers.ts:436-438`) with:

```ts
      .query(async ({ input }) => {
        const results = await db.searchStores(input.query, input.limit);
        // Never surface virtual online storefronts in the finder.
        return results.filter((s) => !isOnlineStoreName(s.name));
      }),
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `routers.ts`.

- [ ] **Step 5: Commit**

```bash
git add server/routers.ts
git commit -m "feat: store finder returns physical branches, hides online storefronts"
```

---

### Task 6: Optimize.tsx — show physical address, drop online label

**Files:**
- Modify: `client/src/pages/Optimize.tsx` (the store-address block, currently ~`:342-376` after the Task in the previous session)

- [ ] **Step 1: Replace the address block**

Find the IIFE block that renders the store address (it currently contains `"Compra en línea · envío a domicilio"`). Replace that entire `{(() => { ... })()}` block with:

```tsx
                            {"address" in store &&
                            typeof (store as { address?: unknown }).address === "string" &&
                            (store as { address: string }).address.trim() !== "" ? (
                              <p className="mt-0.5 font-serif italic text-sm text-muted-foreground">
                                {(store as { address: string }).address}
                              </p>
                            ) : (
                              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                Dirección por confirmar
                              </p>
                            )}
```

- [ ] **Step 2: Verify in the running preview**

The dev server is running (see `preview_list`). After HMR:
- Run an optimization that returns stores.
- Confirm each stop shows a real address (e.g. "Escazú") and the store name is a physical branch (e.g. "Walmart Escazú"), with no "(en línea)" and no "Compra en línea" label.

Use `preview_screenshot` to capture the route view as proof.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors in `Optimize.tsx`.

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/Optimize.tsx
git commit -m "fix: show physical branch address in optimized route"
```

---

### Task 7: Stores.tsx and MapView.tsx — key by placeId

**Files:**
- Modify: `client/src/pages/Stores.tsx` (`key={store.id}` in the grid map, ~`:147`)
- Modify: `client/src/pages/MapView.tsx` (`id: tul-${store.id}` and `id: store.id`, ~`:207-216`)

- [ ] **Step 1: Stores.tsx — stable key**

Replace `key={store.id}` (in the `storesWithTags.map(...)` grid) with:

```tsx
                key={(store as { placeId?: string }).placeId ?? String(store.id)}
```

Also update the avatar tint fallback so two same-chain branches still render: replace `tintFor(store.chainId ?? store.id)` with:

```tsx
                        tintFor(store.chainId ?? (store as { placeId?: string }).placeId ?? store.id)
```

- [ ] **Step 2: MapView.tsx — marker identity by placeId**

In the marker-building block (~`:207-216`), replace the marker `id` and nested `id` so physical branches don't collide on `id: 0`:

```tsx
        id: `tul-${(store as { placeId?: string }).placeId ?? store.id}`,
```

and in the nested object:

```tsx
            id: (store as { placeId?: string }).placeId ?? store.id,
```

(If `MarkerData.id` is typed as `number`, cast the nested `id` with `as any` to match the existing loose typing already used in that file; do not widen the shared type in this task.)

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no new errors in `Stores.tsx` / `MapView.tsx`.

- [ ] **Step 4: Verify finder in preview**

Navigate to the Tiendas page; confirm physical branches list with real names/addresses and no "(en línea)" entries. Capture a `preview_screenshot`.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Stores.tsx client/src/pages/MapView.tsx
git commit -m "fix: key store cards/markers by placeId for physical branches"
```

---

### Task 8: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS, including the new `chainMatch`, `storeDiscovery`, and `smartCart` tests.

- [ ] **Step 2: Type-check the project**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 3: Manual smoke in preview**

- Optimizer route: physical branches with real addresses, real "Traslado", no "(en línea)".
- Tiendas finder: physical branches only.
Capture `preview_screenshot` of both as proof.

- [ ] **Step 4: Final commit (if any residual changes)**

```bash
git add -A
git commit -m "chore: verify physical-store optimization end to end"
```

---

## Notes / Out of Scope

- No se borran las tiendas en línea ni sus precios: son la base de precio por cadena.
- Captura de precio por sucursal física y persistencia perezosa de sucursales (upsert por `placeId` al hacer `prices.submit`) quedan para un plan posterior. `prices.submit` sigue funcionando contra `storeId` existentes y no se toca aquí.
- Si Google Places no está disponible y la caché está vacía, el optimizador devuelve `[]` (comportamiento confirmado con el usuario).
