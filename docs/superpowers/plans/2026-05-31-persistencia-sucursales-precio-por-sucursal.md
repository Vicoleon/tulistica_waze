# Persistencia de sucursales físicas + precio por sucursal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persistir cada sucursal física descubierta (Google Places) con id real + coordenadas, para que crowdedness/analytics y la captura de precio por sucursal funcionen, y que el optimizador prefiera el precio propio de la sucursal cuando exista.

**Architecture:** Migración añade `placeId` único a `stores`. `discoverPhysicalStores` hace upsert idempotente por `placeId` y devuelve el id real. Un resolutor puro `resolveBranchPrices` decide el precio por precedencia (sucursal > en línea cadena > estimado Walmart×margen); `getBranchPriceMatrix` junta los datos y lo invoca; `smartCart` lo usa con el id real de sucursal.

**Tech Stack:** TypeScript, Drizzle (MySQL en Docker vía `DATABASE_URL`), tRPC, Vitest, React + shadcn/ui.

---

## File Structure

- **Modify** `drizzle/schema.ts` — añadir `placeId` a `stores`. Genera migración nueva en `drizzle/`.
- **Modify** `server/db.ts` — `upsertPhysicalStore`, `getBranchPriceMatrix`.
- **Create** `server/services/branchPricing.ts` — `resolveBranchPrices` (puro) + tipos.
- **Create** `server/services/branchPricing.test.ts` — unit tests del resolutor.
- **Modify** `server/services/storeDiscovery.ts` — persistir + `id` real en `PhysicalStore`.
- **Modify** `server/services/storeDiscovery.test.ts` — mock `upsertPhysicalStore`.
- **Modify** `server/services/smartCart.ts` — usar id real + `getBranchPriceMatrix`.
- **Modify** `server/services/smartCart.test.ts` — mock `getBranchPriceMatrix`.
- **Modify** `server/routers.ts` — `stores.getNearby` devuelve id real.
- **Create** `client/src/components/map/ReportPriceDialog.tsx` — diálogo de reporte de precio.
- **Modify** `client/src/pages/MapView.tsx` — botón "Reportar precio aquí" + diálogo.

---

### Task 1: Migración — `placeId` en `stores`

**Files:**
- Modify: `drizzle/schema.ts` (tabla `stores`, ~líneas 59-84)

- [ ] **Step 1: Añadir la columna**

En `drizzle/schema.ts`, dentro de `export const stores = mysqlTable("stores", { ... })`, añadir tras `brandId: int("brandId"),`:

```ts
  placeId: varchar("placeId", { length: 255 }),
```

Y en el array de índices de la tabla (donde están `index("idx_stores_location")...`), añadir un índice único:

```ts
  uniqueIndex("idx_stores_placeId").on(table.placeId),
```

Asegurate de que `uniqueIndex` esté importado desde `drizzle-orm/mysql-core` al inicio del archivo (junto a `index`). Si no está, añadilo al import existente.

- [ ] **Step 2: Generar la migración**

Run: `pnpm drizzle-kit generate`
Expected: crea un nuevo archivo `drizzle/0011_*.sql` (o el siguiente número libre) con `ALTER TABLE stores ADD ... placeId` y el índice único. (Si el repo ya tiene 0011/0012, drizzle usará el siguiente número; eso está bien.)

- [ ] **Step 3: Aplicar a la base Docker**

Run: `pnpm drizzle-kit migrate`
Expected: aplica sin error (la MySQL en Docker está corriendo; `DATABASE_URL` apunta a ella).

- [ ] **Step 4: Verificar la columna en la DB**

Run:
```bash
node --env-file=.env -e 'import("mysql2/promise").then(async m=>{const c=await m.createConnection(process.env.DATABASE_URL);const [r]=await c.query("SHOW COLUMNS FROM stores LIKE \"placeId\"");console.log(JSON.stringify(r));await c.end();})'
```
Expected: imprime una fila describiendo la columna `placeId` (varchar(255), nullable).

- [ ] **Step 5: Commit**

```bash
git add drizzle/schema.ts drizzle/
git commit -m "feat(db): add placeId column to stores for physical branch identity"
```

---

### Task 2: `upsertPhysicalStore` (db.ts)

**Files:**
- Modify: `server/db.ts` (añadir tras `getOnlineStoreIdsByChain`, ~línea 360)

- [ ] **Step 1: Implementar el helper**

Insertá esta función justo después de `getOnlineStoreIdsByChain`:

```ts
export interface PhysicalStoreUpsert {
  placeId: string;
  name: string;
  chainId: string;
  address: string;
  latitude: number;
  longitude: number;
  avgRating: number | null;
}

/**
 * Insert-or-update a discovered physical branch by its Google Places id.
 * Idempotent: the same placeId always maps to the same stores.id. Returns the
 * store id, or null when there is no DB connection. Also links the
 * googlePlacesCache row to the store when present.
 */
export async function upsertPhysicalStore(s: PhysicalStoreUpsert): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  await db.insert(stores).values({
    placeId: s.placeId,
    name: s.name,
    chainId: s.chainId,
    address: s.address,
    latitude: s.latitude,
    longitude: s.longitude,
    avgRating: s.avgRating ?? 0,
    isActive: true,
  }).onDuplicateKeyUpdate({
    set: {
      name: s.name,
      chainId: s.chainId,
      address: s.address,
      latitude: s.latitude,
      longitude: s.longitude,
      avgRating: s.avgRating ?? 0,
      isActive: true,
    },
  });
  const rows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.placeId, s.placeId))
    .limit(1);
  const storeId = rows[0]?.id ?? null;
  if (storeId != null) {
    // Best-effort link the cached place to the store row.
    await db
      .update(googlePlacesCache)
      .set({ storeId })
      .where(eq(googlePlacesCache.placeId, s.placeId));
  }
  return storeId;
}
```

Verificá que `stores`, `googlePlacesCache`, `eq` ya estén importados en db.ts (lo están; se usan en funciones vecinas).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en db.ts.

- [ ] **Step 3: Verificar idempotencia contra la DB Docker**

Run:
```bash
node --env-file=.env -e '
import("./server/db.ts").then(async (db)=>{
  const a = await db.upsertPhysicalStore({ placeId:"test-place-xyz", name:"Test Branch", chainId:"walmart", address:"Calle 1", latitude:9.93, longitude:-84.08, avgRating:4.1 });
  const b = await db.upsertPhysicalStore({ placeId:"test-place-xyz", name:"Test Branch (upd)", chainId:"walmart", address:"Calle 1", latitude:9.93, longitude:-84.08, avgRating:4.2 });
  console.log("first:", a, "second:", b, "idempotent:", a===b);
  process.exit(a===b && a!=null ? 0 : 1);
})' 2>&1 | tail -5
```
Expected: `idempotent: true` y un id numérico repetido. (tsx no es necesario; si el import .ts falla por ESM/TS, usar `npx tsx -e '...'` con el mismo cuerpo.)

- [ ] **Step 4: Limpiar la fila de prueba**

Run:
```bash
node --env-file=.env -e 'import("mysql2/promise").then(async m=>{const c=await m.createConnection(process.env.DATABASE_URL);await c.query("DELETE FROM stores WHERE placeId=\"test-place-xyz\"");console.log("cleaned");await c.end();})'
```
Expected: `cleaned`.

- [ ] **Step 5: Commit**

```bash
git add server/db.ts
git commit -m "feat(db): upsertPhysicalStore idempotent by placeId"
```

---

### Task 3: `resolveBranchPrices` — resolutor puro de precedencia

**Files:**
- Create: `server/services/branchPricing.ts`
- Test: `server/services/branchPricing.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
// server/services/branchPricing.test.ts
import { describe, expect, it } from "vitest";
import { resolveBranchPrices } from "./branchPricing";

describe("resolveBranchPrices", () => {
  const branches = [
    { storeId: 100, chainId: "walmart" },
    { storeId: 200, chainId: "maxipali" },
  ];
  const productIds = [1, 2];

  it("prefers a branch's own reported price over chain-online and estimate", () => {
    const out = resolveBranchPrices({
      branches,
      productIds,
      branchPrices: new Map([["100:1", 950]]), // Walmart branch own price for product 1
      onlineChainPrices: new Map([["walmart:1", 1000], ["maxipali:1", 700]]),
      walmartBaseline: new Map([[1, 1000]]),
    });
    const w1 = out.find((r) => r.storeId === 100 && r.productId === 1)!;
    expect(w1).toMatchObject({ price: 950, source: "reported" });
  });

  it("falls back to the chain online price when no branch price exists", () => {
    const out = resolveBranchPrices({
      branches,
      productIds,
      branchPrices: new Map(),
      onlineChainPrices: new Map([["maxipali:1", 700]]),
      walmartBaseline: new Map([[1, 1000]]),
    });
    const m1 = out.find((r) => r.storeId === 200 && r.productId === 1)!;
    expect(m1).toMatchObject({ price: 700, source: "reported" });
  });

  it("derives from Walmart baseline × margin when chain has no online price", () => {
    const out = resolveBranchPrices({
      branches,
      productIds,
      branchPrices: new Map(),
      onlineChainPrices: new Map(), // maxipali has no online price for product 1
      walmartBaseline: new Map([[1, 1000]]),
    });
    const m1 = out.find((r) => r.storeId === 200 && r.productId === 1)!;
    // maxipali multiplier 0.905, rounded to nearest 5 -> 905
    expect(m1).toMatchObject({ price: 905, source: "estimated" });
  });

  it("omits a (branch, product) with no signal at any level", () => {
    const out = resolveBranchPrices({
      branches,
      productIds: [2],
      branchPrices: new Map(),
      onlineChainPrices: new Map(),
      walmartBaseline: new Map(), // nothing for product 2
    });
    expect(out).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Correr para ver que falla**

Run: `npx vitest run server/services/branchPricing.test.ts`
Expected: FAIL — no existe `./branchPricing`.

- [ ] **Step 3: Implementar**

```ts
// server/services/branchPricing.ts
import { derivePrice } from "./pricingFallback";

export type PriceSource = "reported" | "estimated";

export interface BranchPriceInputs {
  branches: { storeId: number; chainId: string }[];
  productIds: number[];
  /** key `${storeId}:${productId}` -> price (user-reported, geofenced). */
  branchPrices: Map<string, number>;
  /** key `${chainId}:${productId}` -> chain online base price. */
  onlineChainPrices: Map<string, number>;
  /** productId -> Walmart baseline price. */
  walmartBaseline: Map<number, number>;
}

export interface BranchPrice {
  storeId: number;
  productId: number;
  price: number;
  source: PriceSource;
}

/**
 * Resolve the price for each (branch, product) by precedence:
 *   1. the branch's own reported price            -> reported
 *   2. the chain's online base price              -> reported
 *   3. Walmart baseline × chain margin (derive)   -> estimated
 *   4. nothing -> omit (Smart Cart treats as missing)
 */
export function resolveBranchPrices(inputs: BranchPriceInputs): BranchPrice[] {
  const { branches, productIds, branchPrices, onlineChainPrices, walmartBaseline } = inputs;
  const out: BranchPrice[] = [];
  for (const branch of branches) {
    for (const productId of productIds) {
      const own = branchPrices.get(`${branch.storeId}:${productId}`);
      if (own !== undefined) {
        out.push({ storeId: branch.storeId, productId, price: own, source: "reported" });
        continue;
      }
      const online = onlineChainPrices.get(`${branch.chainId}:${productId}`);
      if (online !== undefined) {
        out.push({ storeId: branch.storeId, productId, price: online, source: "reported" });
        continue;
      }
      const base = walmartBaseline.get(productId);
      if (base !== undefined) {
        out.push({
          storeId: branch.storeId,
          productId,
          price: derivePrice(base, branch.chainId),
          source: "estimated",
        });
      }
      // else: omit
    }
  }
  return out;
}
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `npx vitest run server/services/branchPricing.test.ts`
Expected: PASS (4 casos). Nota: `derivePrice` redondea a múltiplos de 5 (`pricingFallback.ts`); maxipali 0.905 × 1000 = 905.

- [ ] **Step 5: Commit**

```bash
git add server/services/branchPricing.ts server/services/branchPricing.test.ts
git commit -m "feat: resolveBranchPrices precedence resolver (branch > online > estimate)"
```

---

### Task 4: `getBranchPriceMatrix` (db.ts) — junta datos y resuelve

**Files:**
- Modify: `server/db.ts` (añadir tras `getPriceMatrix`)

- [ ] **Step 1: Implementar**

Añadir, importando el resolutor al inicio de db.ts (junto a los otros imports de `./services/...`):

```ts
import { resolveBranchPrices, type BranchPrice } from "./services/branchPricing";
```

Y la función (tras `getPriceMatrix`):

```ts
/**
 * Price each (physical branch, product) by precedence — see resolveBranchPrices:
 * branch's own reported price > chain online base price > Walmart×margin estimate.
 */
export async function getBranchPriceMatrix(
  branches: { storeId: number; chainId: string }[],
  productIds: number[],
): Promise<BranchPrice[]> {
  const db = await getDb();
  if (!db || branches.length === 0 || productIds.length === 0) return [];

  const branchIds = branches.map((b) => b.storeId);

  // 1. Per-branch user-reported prices (newest non-outlier wins).
  const branchRows = await db.select({
    storeId: priceEntries.storeId,
    productId: priceEntries.productId,
    price: priceEntries.price,
  })
    .from(priceEntries)
    .where(and(
      inArray(priceEntries.storeId, branchIds),
      inArray(priceEntries.productId, productIds),
      eq(priceEntries.isOutlier, false),
    ))
    .orderBy(desc(priceEntries.createdAt));
  const branchPrices = new Map<string, number>();
  for (const r of branchRows) {
    const key = `${r.storeId}:${r.productId}`;
    if (!branchPrices.has(key)) branchPrices.set(key, r.price);
  }

  // 2. Chain online base prices (from the "(en línea)" storefronts).
  const onlineByChain = await getOnlineStoreIdsByChain(); // chainId -> online storeId
  const onlineIdToChain = new Map<number, string>();
  for (const [chain, id] of onlineByChain) onlineIdToChain.set(id, chain);
  const onlineStoreIds = Array.from(new Set(onlineByChain.values()));
  const onlineChainPrices = new Map<string, number>();
  if (onlineStoreIds.length > 0) {
    const onlineRows = await db.select({
      storeId: priceEntries.storeId,
      productId: priceEntries.productId,
      price: priceEntries.price,
    })
      .from(priceEntries)
      .where(and(
        inArray(priceEntries.storeId, onlineStoreIds),
        inArray(priceEntries.productId, productIds),
        eq(priceEntries.isOutlier, false),
      ))
      .orderBy(desc(priceEntries.createdAt));
    for (const r of onlineRows) {
      const chain = onlineIdToChain.get(r.storeId);
      if (!chain) continue;
      const key = `${chain}:${r.productId}`;
      if (!onlineChainPrices.has(key)) onlineChainPrices.set(key, r.price);
    }
  }

  // 3. Walmart baseline (newest per product) for the estimate fallback.
  const walmartStoreRows = await db.select({ id: stores.id }).from(stores)
    .where(eq(stores.chainId, "walmart"));
  const walmartStoreIds = walmartStoreRows.map((s) => s.id);
  const walmartBaseline = new Map<number, number>();
  if (walmartStoreIds.length > 0) {
    const baseRows = await db.select({
      productId: priceEntries.productId,
      price: priceEntries.price,
    })
      .from(priceEntries)
      .where(and(
        inArray(priceEntries.storeId, walmartStoreIds),
        inArray(priceEntries.productId, productIds),
        eq(priceEntries.isOutlier, false),
      ))
      .orderBy(desc(priceEntries.createdAt));
    for (const r of baseRows) {
      if (!walmartBaseline.has(r.productId)) walmartBaseline.set(r.productId, r.price);
    }
  }

  return resolveBranchPrices({ branches, productIds, branchPrices, onlineChainPrices, walmartBaseline });
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en db.ts. (`inArray`, `desc`, `and`, `eq`, `priceEntries`, `stores` ya están importados.)

- [ ] **Step 3: Commit**

```bash
git add server/db.ts
git commit -m "feat(db): getBranchPriceMatrix gathers data + delegates to resolver"
```

---

### Task 5: Persistir en `discoverPhysicalStores`

**Files:**
- Modify: `server/services/storeDiscovery.ts`
- Modify: `server/services/storeDiscovery.test.ts`

- [ ] **Step 1: Actualizar el test**

Reemplazar el contenido de `server/services/storeDiscovery.test.ts` por:

```ts
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
  // Assign a stable fake id per placeId.
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
    expect(result[0].id).toBe(503); // MaxiPalí persisted id
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
```

- [ ] **Step 2: Correr para ver que falla**

Run: `npx vitest run server/services/storeDiscovery.test.ts`
Expected: FAIL — `PhysicalStore` no tiene `id` / no se llama `upsertPhysicalStore`.

- [ ] **Step 3: Implementar**

En `server/services/storeDiscovery.ts`:

(a) Actualizar el import de db:
```ts
import { cacheGooglePlace, getNearbyGooglePlaces, upsertPhysicalStore } from "../db";
```

(b) Añadir `id` a la interfaz `PhysicalStore`:
```ts
export interface PhysicalStore {
  id: number;
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  chainId: KnownChainId;
  distanceKm: number;
  avgRating: number | null;
}
```

(c) En el loop final, persistir y asignar `id`; omitir si no hay id. Reemplazar el bloque que hoy hace `result.push({...})` por:
```ts
  const result: PhysicalStore[] = [];
  for (const p of raw) {
    const chainId = matchChain(p.name);
    if (!chainId) continue;
    const distanceKm = haversineKm(lat, lng, p.latitude, p.longitude);
    if (distanceKm > radiusKm) continue;
    const address = p.address ?? "";
    const avgRating = p.rating ?? null;
    const id = await upsertPhysicalStore({
      placeId: p.placeId,
      name: p.name,
      chainId,
      address,
      latitude: p.latitude,
      longitude: p.longitude,
      avgRating,
    });
    if (id == null) continue; // no DB -> can't give a stable id; skip
    result.push({
      id,
      placeId: p.placeId,
      name: p.name,
      address,
      latitude: p.latitude,
      longitude: p.longitude,
      chainId,
      distanceKm,
      avgRating,
    });
  }
  result.sort((a, b) => a.distanceKm - b.distanceKm);
  return result;
```

- [ ] **Step 4: Correr para ver que pasa**

Run: `npx vitest run server/services/storeDiscovery.test.ts`
Expected: PASS (2 casos).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add server/services/storeDiscovery.ts server/services/storeDiscovery.test.ts
git commit -m "feat: persist discovered branches and return real store id"
```

---

### Task 6: `smartCart` usa id real + `getBranchPriceMatrix`

**Files:**
- Modify: `server/services/smartCart.ts`
- Modify: `server/services/smartCart.test.ts`

- [ ] **Step 1: Actualizar el test**

Reemplazar el `vi.mock("../db", ...)` y el primer caso de `server/services/smartCart.test.ts` para mockear `getBranchPriceMatrix` en vez de `getPriceMatrix`/`getOnlineStoreIdsByChain`:

```ts
vi.mock("../db", () => ({
  getProductsByIds: vi.fn(),
  getBranchPriceMatrix: vi.fn(),
}));
vi.mock("./storeDiscovery", () => ({ discoverPhysicalStores: vi.fn() }));

import { getProductsByIds, getBranchPriceMatrix } from "../db";
import { discoverPhysicalStores } from "./storeDiscovery";
import { SmartCartEngine } from "./smartCart";
```

Reemplazar el primer caso por:

```ts
  it("prices branches via getBranchPriceMatrix, uses real branch ids, no online stores", async () => {
    vi.mocked(discoverPhysicalStores).mockResolvedValue([
      { id: 502, placeId: "w1", name: "Walmart Escazú", address: "Escazú", latitude: 9.92, longitude: -84.14, chainId: "walmart", distanceKm: 2, avgRating: 4 },
      { id: 503, placeId: "m1", name: "MaxiPalí Centro", address: "San José", latitude: 9.93, longitude: -84.08, chainId: "maxipali", distanceKm: 1, avgRating: 4 },
    ] as any);
    vi.mocked(getProductsByIds).mockResolvedValue([
      { id: 1, name: "Arroz" },
      { id: 2, name: "Agua" },
    ] as any);
    // Branch-priced matrix keyed by real branch storeId.
    vi.mocked(getBranchPriceMatrix).mockResolvedValue([
      { storeId: 502, productId: 1, price: 1000, source: "reported" },
      { storeId: 502, productId: 2, price: 500, source: "reported" },
      { storeId: 503, productId: 1, price: 700, source: "reported" },
      { storeId: 503, productId: 2, price: 900, source: "estimated" },
    ] as any);

    const engine = new SmartCartEngine(prefs);
    const results = await engine.optimizeCart([1, 2], 10);

    expect(results.length).toBeGreaterThan(0);
    const allStoreNames = results.flatMap((r) => r.stores.map((s) => s.name));
    expect(allStoreNames.some((n) => /\(en l[íi]nea\)/i.test(n))).toBe(false);
    const single = results.find((r) => r.type === "SINGLE")!;
    expect(single.stores[0].address).toBeTruthy();
    // Cheapest single = MaxiPalí (id 503): cart 700+900=1600, trip 2km*100=200 -> 1800,
    // vs Walmart cart 1000+500=1500, trip 4km*100=400 -> 1900. 1800 < 1900.
    expect(single.stores[0].id).toBe(503);
    const maxiArroz = results
      .flatMap((r) => r.itemBreakdown)
      .find((it) => it.storeName === "MaxiPalí Centro" && it.productName === "Arroz");
    expect(maxiArroz).toMatchObject({ price: 700, storeId: 503, source: "reported" });
  });
```

(El segundo caso `returns [] when no physical stores are found` queda igual.)

- [ ] **Step 2: Correr para ver que falla**

Run: `npx vitest run server/services/smartCart.test.ts`
Expected: FAIL — `getBranchPriceMatrix` no existe / smartCart aún usa getPriceMatrix.

- [ ] **Step 3: Implementar — reescribir la sección de precios de `optimizeCart`**

En `server/services/smartCart.ts`:

(a) Cambiar el import (línea 1):
```ts
import { getProductsByIds, getBranchPriceMatrix } from "../db";
import { discoverPhysicalStores } from "./storeDiscovery";
```

(b) Reemplazar TODO el bloque desde el comentario `// 3. Online "base" prices...` hasta el final del bloque que construye `priceMatrix` (es decir, los pasos 3 y 4 actuales: el cálculo de `onlineByChain`/`onlineIdToChain`/`onlineStoreIds`/`priceData`/`chainPrices`, el `interface StoreCandidate`+`candidates`, y el `priceMatrix`) por:

```ts
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
```

El resto de `optimizeCart` (SINGLE/SPLIT, que ya usa `priceMatrix.get(store.placeId)`, `entry.price`, `entry.source`, `store.id`) NO cambia. Confirmá que ya no quedan referencias a `getOnlineStoreIdsByChain`, `getPriceMatrix`, `onlineByChain`, ni `chainPrices` en el archivo.

- [ ] **Step 4: Correr tests**

Run: `npx vitest run server/services/smartCart.test.ts`
Expected: PASS. Luego toda la suite: `npm test` — único fallo aceptable el pre-existente `trpc.middleware.test.ts > verifiedProcedure > blocks unverified user`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add server/services/smartCart.ts server/services/smartCart.test.ts
git commit -m "feat: optimizer prices physical branches via precedence resolver"
```

---

### Task 7: `stores.getNearby` devuelve id real

**Files:**
- Modify: `server/routers.ts` (`stores.getNearby`, el `.map(...)`)

- [ ] **Step 1: Cambiar el id mapeado**

En `server/routers.ts`, dentro de `stores.getNearby`, en el `physical.map((s) => ({ ... }))`, reemplazar:
```ts
          id: 0, // physical branches have no DB row yet; identity is placeId
```
por:
```ts
          id: s.id, // real persisted store id (enables crowdedness/analytics/price submit)
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores (`PhysicalStore` ahora tiene `id`).

- [ ] **Step 3: Verificar en vivo (DB Docker + Places)**

Con el server de preview corriendo (puerto 3001), desde la página:
```js
// preview_eval
(async () => {
  const input = encodeURIComponent(JSON.stringify({"0":{"json":{"latitude":9.9281,"longitude":-84.0907,"radiusKm":6}}}));
  const r = await fetch(`/api/trpc/stores.getNearby?batch=1&input=${input}`);
  const b = await r.json();
  const data = b?.[0]?.result?.data?.json ?? [];
  return JSON.stringify(data.slice(0,5).map(s => ({ id: s.id, name: s.name })), null, 2);
})()
```
Expected: cada tienda tiene un `id` numérico > 0 (no 0), y repetir la llamada devuelve los mismos ids (persistencia idempotente).

- [ ] **Step 4: Commit**

```bash
git add server/routers.ts
git commit -m "feat: stores.getNearby returns real persisted branch id"
```

---

### Task 8: Botón "Reportar precio aquí" en MapView

**Files:**
- Create: `client/src/components/map/ReportPriceDialog.tsx`
- Modify: `client/src/pages/MapView.tsx`

- [ ] **Step 1: Crear el diálogo**

```tsx
// client/src/components/map/ReportPriceDialog.tsx
import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ReportPriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: number;
  storeName: string;
  userLocation: { lat: number; lng: number } | null;
}

export function ReportPriceDialog({
  open, onOpenChange, storeId, storeName, userLocation,
}: ReportPriceDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null);
  const [price, setPrice] = useState("");

  const { data: products } = trpc.products.search.useQuery(
    { query, limit: 6 },
    { enabled: query.length > 2 },
  );

  const submitPrice = trpc.prices.submit.useMutation({
    onSuccess: (res) => {
      toast.success(res.isVerified ? "¡Precio confirmado, gracias!" : "Precio enviado para revisión.");
      onOpenChange(false);
      setQuery(""); setSelectedProduct(null); setPrice("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!selectedProduct || !price) return;
    submitPrice.mutate({
      storeId,
      productId: selectedProduct.id,
      price: parseFloat(price),
      userLatitude: userLocation?.lat,
      userLongitude: userLocation?.lng,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">Reportar precio</DialogTitle>
          <DialogDescription>{storeName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Producto</Label>
            {selectedProduct ? (
              <div className="flex items-center justify-between rounded-xl border border-border bg-paper-deep px-3 py-2">
                <span className="text-sm">{selectedProduct.name}</span>
                <Button variant="ghost" size="sm" onClick={() => setSelectedProduct(null)}>Cambiar</Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Buscar producto…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="rounded-xl"
                />
                {products && products.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                    {products.map((p: { id: number; name: string }) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-paper-deep"
                          onClick={() => { setSelectedProduct({ id: p.id, name: p.name }); }}
                        >
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-price">Precio (₡)</Label>
            <Input
              id="report-price"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedProduct || !price || submitPrice.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitPrice.isPending ? "Enviando…" : "Enviar precio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Cablear en MapView**

En `client/src/pages/MapView.tsx`:

(a) Import al inicio (junto a otros imports de componentes):
```tsx
import { ReportPriceDialog } from "@/components/map/ReportPriceDialog";
```

(b) Estado, junto a los otros `useState` (~línea 87):
```tsx
  const [reportPriceOpen, setReportPriceOpen] = useState(false);
```

(c) En `<SelectedStoreCard ... />` (~línea 457), añadir un prop callback junto a `onReportBusyness`:
```tsx
                onReportPrice={() => setReportPriceOpen(true)}
```

(d) Renderizar el diálogo junto al `<Dialog>` de crowdedness (~línea 484, dentro del mismo fragmento de retorno):
```tsx
      {selectedStore && (
        <ReportPriceDialog
          open={reportPriceOpen}
          onOpenChange={setReportPriceOpen}
          storeId={selectedStore.id}
          storeName={selectedStore.name}
          userLocation={userLocation}
        />
      )}
```

(e) En el componente `SelectedStoreCard` (mismo archivo), añadir `onReportPrice?: () => void` a sus props y un botón que lo dispare, espejando el botón existente "onReportBusyness". Buscá dónde se usa `onReportBusyness` dentro de `SelectedStoreCard` y añadí, al lado, un botón:
```tsx
              {onReportPrice && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onReportPrice}
                  className="rounded-full border-border"
                >
                  Reportar precio aquí
                </Button>
              )}
```
Ajustá el `interface` de props de `SelectedStoreCard` para incluir `onReportPrice?: () => void`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos en MapView.tsx / ReportPriceDialog.tsx.

- [ ] **Step 4: Verificar en preview**

Con el server corriendo: navegá a `/map`, seleccioná una sucursal (pin), confirmá que aparece el botón "Reportar precio aquí", abrilo, buscá un producto, escribí un precio. (El submit real requiere usuario verificado + geocerca; basta con confirmar que el diálogo abre, busca productos y arma el mutate sin errores de consola.) Capturá `preview_screenshot` del diálogo abierto.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/map/ReportPriceDialog.tsx client/src/pages/MapView.tsx
git commit -m "feat(map): report-price-here dialog on selected branch"
```

---

### Task 9: Verificación end-to-end

- [ ] **Step 1: Suite + tipos**

Run: `npm test` (único fallo aceptable: el pre-existente `trpc.middleware.test.ts`). Luego `npm run check` (sin errores).

- [ ] **Step 2: Persistencia + ids reales en vivo**

Reiniciar el preview (para tomar migración/código). Llamar `stores.getNearby` (ver Task 7 Step 3) dos veces: ids numéricos > 0 y estables entre llamadas.

- [ ] **Step 3: Precio por sucursal afecta el optimizador (DB Docker)**

Tomar un `storeId` real devuelto por getNearby y un `productId` con precio (p. ej. 1). Insertar una entrada de precio propia de esa sucursal directamente en la DB (simula un reporte geocercado) y verificar que el optimizador la usa con `source: 'reported'`:
```bash
node --env-file=.env -e 'import("mysql2/promise").then(async m=>{const c=await m.createConnection(process.env.DATABASE_URL);await c.query("INSERT INTO price_entries (storeId, productId, price, isOutlier, isVerified) VALUES (?,?,?,?,?)",[STORE_ID,1,123,0,1]);console.log("inserted");await c.end();})'
```
(Reemplazar `STORE_ID` por el id real.) Luego, autenticado en la app, correr el optimizador para una lista que incluya el producto 1 y confirmar que para esa sucursal el ítem muestra precio 123 y `source: 'reported'`. Si no es práctico autenticarse, verificar vía un script que llama `getBranchPriceMatrix([{storeId:STORE_ID,chainId:'<chain>'}],[1])` y devuelve `{price:123, source:'reported'}`. Limpiar la fila de prueba al final (`DELETE FROM price_entries WHERE storeId=STORE_ID AND price=123`).

- [ ] **Step 4: Commit final (si quedaron cambios)**

```bash
git add -A
git commit -m "chore: verify physical-store persistence + per-branch pricing"
```

---

## Notas / Fuera de alcance

- El flujo de captura móvil (marcar lista mientras se compra + escanear hablador confirmando barcode) vive en la app móvil; aquí solo backend + botón web. Ver memoria `price_capture_vision`.
- `prices.submit` es `verifiedProcedure`: requiere usuario con email verificado. El gate de verificación está deshabilitado globalmente (commit 266d216), así que en la práctica funciona en dev.
- Las tiendas "(en línea)" siguen existiendo como fuente del precio base por cadena; no se borran.
