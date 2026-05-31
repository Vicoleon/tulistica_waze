# Persistencia de sucursales físicas + precio por sucursal

**Fecha:** 2026-05-31
**Estado:** Diseño aprobado pendiente de revisión

## Problema

Las sucursales físicas se descubren en vivo vía Google Places y **no se persisten**:
`stores.getNearby` devuelve `id: 0` para todas. Por eso, para sucursales físicas:

- **Crowdedness y analytics** en MapView (que usan `selectedStore.id`) no funcionan
  (`id: 0` es falsy → se saltan silenciosamente).
- **La captura de precio por sucursal** no puede atarse a una sucursal real
  (`prices.submit` necesita un `storeId` con coordenadas para validar geocerca).

## Objetivo

Persistir cada sucursal descubierta con un **id real** y coordenadas, de modo que:
1. Crowdedness/analytics/captura por sucursal funcionen sin rediseñar su lógica.
2. El optimizador pueda usar el **precio propio de la sucursal** cuando exista,
   con precedencia clara sobre el precio en línea base de la cadena.

La captura de precio principal vivirá en la app móvil (marcar lista mientras se
compra; actualizar precio o escanear el "hablador" confirmando el barcode). En web
dejamos el backend listo y un botón secundario de reporte en el mapa.

## Arquitectura

### 1. Esquema (migración)

Agregar a `stores` (`drizzle/schema.ts`):

```ts
placeId: varchar("placeId", { length: 255 }).unique(),  // nullable
```

- Las tiendas "(en línea)" y seed no tienen `placeId`; las físicas descubiertas sí.
  Esto distingue ambas sin flags adicionales.
- Generar con `drizzle-kit generate` y aplicar a la base Docker con `pnpm db:push`.
  (`DATABASE_URL` ya apunta a la MySQL en Docker.)

### 2. Persistencia eager e idempotente

**`server/db.ts` — `upsertPhysicalStore`:**

```ts
interface PhysicalStoreUpsert {
  placeId: string;
  name: string;
  chainId: string;
  address: string;
  latitude: number;
  longitude: number;
  avgRating: number | null;
}
// Inserta o actualiza por placeId (clave única). Devuelve el storeId real, o
// null si no hay DB. Mantiene googlePlacesCache.storeId enlazado al store creado.
export async function upsertPhysicalStore(s: PhysicalStoreUpsert): Promise<number | null>
```

- Implementación: `INSERT ... ON DUPLICATE KEY UPDATE` sobre `stores.placeId`, luego
  `SELECT id WHERE placeId = ?`. Setear `isActive: true`. Si `getDb()` es null
  (modo sin DB), devolver `null`; la capa de descubrimiento omite esa sucursal
  cuando no obtiene id (ver "Manejo de errores").

**`server/services/storeDiscovery.ts` — `discoverPhysicalStores`:**

- Tras emparejar cada lugar a cadena, hace `upsertPhysicalStore` y asigna
  `PhysicalStore.id = storeId` real. Idempotente: mismo `placeId` → mismo `id`.
- `PhysicalStore` gana el campo `id: number`.
- Si no hay DB (`getDb()` null en el upsert), la sucursal se omite de los
  resultados (no podemos darle id estable) — coherente con el fallback degradado
  ya existente.

### 3. Resolutor de precios con precedencia

**`server/db.ts` — `getBranchPriceMatrix`:**

```ts
export async function getBranchPriceMatrix(
  branches: { storeId: number; chainId: string }[],
  productIds: number[],
): Promise<{
  storeId: number;       // id de la sucursal física
  productId: number;
  price: number;
  source: "reported" | "estimated";
}[]>
```

Por cada (sucursal, producto), resuelve en orden:
1. **Precio propio de la sucursal** — `priceEntries` más reciente, no-outlier, con
   `storeId = sucursal.storeId` → `source: 'reported'`.
2. **Precio en línea de la cadena** — `priceEntries` del escaparate "(en línea)" de
   esa `chainId` (vía `getOnlineStoreIdsByChain`) → `source: 'reported'`.
3. **Estimado** — `derivePrice(walmartBaseline, chainId)` (`pricingFallback.ts`)
   → `source: 'estimated'`.
4. Si nada aplica → se omite (Smart Cart lo cuenta como faltante).

Queries: una para entradas reales por sucursal, una para precios en línea por
cadena, una para baseline Walmart. Resolución en memoria.

### 4. Optimizador

**`server/services/smartCart.ts` — `optimizeCart`:**

- `candidates` usan el **id real de la sucursal** (`physical.id`) como `id`.
- En vez de mapear precios desde el id de la tienda en línea, llamar a
  `getBranchPriceMatrix(candidates.map(c => ({ storeId: c.id, chainId: c.chainId })), productIds)`.
- `priceMatrix` keyed por `placeId` (se mantiene, para distinguir sucursales de la
  misma cadena), poblado desde el resultado del resolutor (mapeando storeId→placeId).
- `itemBreakdown.storeId` y `stores[].id` = id real de la sucursal.
- `source` se propaga igual que hoy (badge ESTIMADO).

### 5. Routers y UI

- **`stores.getNearby`** (`routers.ts`): devolver `id: s.id` (real) en vez de `0`.
  El resto del shape no cambia.
- **MapView** (`client/src/pages/MapView.tsx`): con id real, `store_viewed` y
  `crowdedness.getCurrent`/`report` funcionan sin cambios. Agregar un botón
  **"Reportar precio aquí"** en la tarjeta de sucursal seleccionada → diálogo que
  permite elegir un producto (de la lista activa o búsqueda) y un precio, y llama
  `prices.submit({ storeId, productId, price, userLatitude, userLongitude })` con la
  ubicación del usuario para geocerca. Mantener simple (el grueso es móvil).
- **Scanner.tsx**: ya envía `prices.submit({ storeId })`. Verificar que su selector
  de tienda consuma `stores.getNearby` (ids reales) y funcione para físicas; ajustar
  solo si usa una fuente con `id: 0`.

### 6. Geocerca y feedback de `source`

- `prices.submit` valida geocerca contra coords del store; las sucursales ahora
  tienen coords reales → funciona. Un precio reportado dentro de geocerca crea una
  `priceEntries` con `storeId = sucursal` → el resolutor lo prefiere (paso 1) en la
  próxima optimización, y la UI lo muestra como `reported` (sin badge ESTIMADO).

## Manejo de errores y casos borde

- **Sin DB:** `upsertPhysicalStore` no puede dar id → `discoverPhysicalStores` omite
  esas sucursales (resultado vacío en dev sin DB, igual que hoy).
- **Place sin cadena conocida:** ya se descarta antes del upsert.
- **Misma sucursal de Places vista por varios usuarios:** upsert idempotente por
  `placeId` evita duplicados.
- **Cadena sin baseline Walmart y sin precio propio ni en línea:** producto omitido
  para esa sucursal.
- **Geocerca fuera de rango:** `prices.submit` ya marca `withinGeofence: false`;
  comportamiento existente, no se cambia.

## Pruebas

- **Unit `getBranchPriceMatrix`:** precedencia sucursal > en línea > estimado, con
  `source` correcto; producto faltante en todos los niveles → omitido. (db mockeado.)
- **Unit `upsertPhysicalStore`:** idempotencia por `placeId` (mismo place → mismo id).
  (db mockeado, verificar query ON DUPLICATE KEY + select.)
- **Unit `storeDiscovery`:** persiste y asigna id real; omite sucursales si no hay DB.
- **Unit `smartCart`:** `itemBreakdown.storeId` = id real de sucursal; precios por
  precedencia; nunca tiendas "(en línea)".
- **En vivo (DB Docker):** aplicar migración; `stores.getNearby` devuelve ids reales
  persistidos; `prices.submit` geocercado para una sucursal; re-optimizar y verificar
  que toma el precio propio de la sucursal (`source: 'reported'`).

## Alcance

- **Incluye:** migración `placeId`, persistencia eager idempotente, resolutor de
  precios por precedencia, optimizador/finder con id real, botón de reporte en mapa,
  migración aplicada a Docker, pruebas.
- **Fuera:** flujo completo de captura móvil (marcar lista mientras se compra +
  escanear hablador con confirmación de barcode) — vive en la app móvil; aquí solo
  dejamos backend + botón web.
