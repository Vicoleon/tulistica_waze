# Tiendas físicas con precio base en línea

**Fecha:** 2026-05-29
**Estado:** Diseño aprobado pendiente de revisión

## Problema

El optimizador de ruta recomienda tiendas "en línea" (escaparates virtuales por
cadena, p. ej. "MaxiPalí (en línea)"). Eso contradice la idea del producto:
Tulistica es para **comprar en sitio**, en persona. Además esas tiendas virtuales
viven todas en el centro de San José (9.9281, -84.0907), así que el costo de
"Traslado" mostrado es ficticio, y la línea de dirección sale como "Dirección por
confirmar".

## Modelo conceptual

Separar dos cosas que hoy están mezcladas en la entidad "tienda":

1. **Dónde se compra** → una **sucursal física real** (p. ej. "Walmart Escazú"),
   con dirección y coordenadas reales.
2. **De dónde sale el precio** → el **precio en línea de la cadena**, que sirve de
   **base/bootstrap** mientras no haya precios reales por sucursal.

Regla central: **nunca se recomienda ni se lista una tienda en línea como destino.**
Las tiendas "(en línea)" pasan a ser solo el contenedor del precio base de su cadena.

A futuro las usuarias irán metiendo el precio real de cada sucursal; cuando exista
un precio propio de la sucursal, ese gana sobre el precio base de la cadena. Este
spec deja el camino listo pero no implementa la captura masiva de precios por
sucursal (ya existe `prices.submit`).

## Cadenas conocidas

Cadenas con precio en línea hoy (todas tienen `chainId` en la fila de su tienda
virtual): `walmart`, `maxipali`, `masxmenos`, `automercado`, `pricesmart`,
`megasuper`.

## Arquitectura

### Componentes nuevos / modificados

**1. `server/services/chainMatch.ts` (nuevo)**
Unidad pequeña y pura. Responsabilidad única: mapear el nombre de un lugar de
Google a un `chainId` conocido.

```ts
// Devuelve el chainId conocido o null si el lugar no es de una cadena que
// tengamos (sin precio base => no sirve como recomendación).
export function matchChain(placeName: string): KnownChainId | null
```

Implementación: tabla de patrones regex por cadena (walmart, maxi palí, más x
menos, auto mercado, price smart, mega super), case/acentos-insensible.
Probada de forma aislada con nombres reales de Places.

**2. `server/db.ts` — nuevos helpers**

- `getOnlineStoreIdsByChain(): Promise<Map<chainId, storeId>>`
  Agrupa las tiendas virtuales (las que tienen `chainId` y nombre con
  `(en línea)`) y devuelve, por cadena, el `storeId` de su escaparate virtual.
  De ahí salen los precios base.
- `isOnlineStore(store)`: helper compartido (`/\(en l[ií]nea\)/i` sobre el nombre).

**3. `server/services/storeDiscovery.ts` (nuevo)**
Responsabilidad única: dado lat/lng/radio, devolver **sucursales físicas
candidatas** ya emparejadas a cadena.

```ts
interface PhysicalStore {
  placeId: string;
  name: string;       // "Walmart Escazú"
  address: string;    // dirección real de Google
  latitude: number;
  longitude: number;
  chainId: KnownChainId;
  distanceKm: number;
}
export async function discoverPhysicalStores(
  lat: number, lng: number, radiusKm: number
): Promise<PhysicalStore[]>
```

Flujo:
1. Si `isMapsAvailable()`: `searchNearbyGroceryStores(lat,lng,radiusMeters)`.
   - Cachear cada lugar en `googlePlacesCache` (ya existe `cacheGooglePlace`).
2. Si Maps **no** está disponible (dev sin key): leer de `googlePlacesCache`
   los lugares dentro del radio (fallback degradado, sin llamar a la API).
3. Para cada lugar: `matchChain(name)`. Se **descartan** los que no matchean
   ninguna cadena conocida (no tenemos precio base para ellos).
4. Calcular `distanceKm` (haversine) y devolver ordenado por distancia.

**4. `server/services/smartCart.ts` — `optimizeCart`**

- Reemplazar `getNearbyStores` por `discoverPhysicalStores`.
- Construir la matriz de precios así: cargar `getOnlineStoreIdsByChain()` una vez;
  para cada sucursal física, sus precios = precios de la tienda en línea de su
  `chainId` (vía `getPriceMatrix(onlineStoreIds, productIds)`, mapeando
  online→sucursal). La distancia/Traslado usan las coordenadas reales.
- El `OptimizationResult.stores[]` lleva ahora `address`, `chainId`, `placeId`,
  `latitude`, `longitude` además de `name` y `distanceKm`.
- Dos sucursales de la misma cadena tienen el mismo precio base; el desempate es
  por distancia. (El "split" entre cadenas sigue igual.)

**5. `server/routers.ts` — `stores.getNearby` (buscador de tiendas)**

- Cambiar para devolver **sucursales físicas** vía `discoverPhysicalStores`
  (mismo origen que el optimizador), no las filas virtuales de la BD.
- `stores.search` (texto): filtrar las tiendas en línea con `isOnlineStore`.

**6. Cliente**

- `client/src/pages/Optimize.tsx`: revertir la etiqueta "Compra en línea";
  mostrar `store.address` real (y nombre de sucursal). Caer a "Dirección por
  confirmar" solo si de verdad faltara la dirección (no debería con Places).
- `client/src/pages/Stores.tsx` y `client/src/pages/MapView.tsx`: consumen el
  nuevo shape de `stores.getNearby` (sucursales físicas con dirección/coords).

### Flujo de datos (optimizador)

```
usuario (lat,lng) ─▶ discoverPhysicalStores ─▶ [sucursales físicas + chainId]
                                                   │
getOnlineStoreIdsByChain ──▶ Map<chainId, onlineStoreId>
                                                   │
            por sucursal: precio = precios(onlineStoreId de su cadena)
                                                   ▼
                          SmartCartEngine (single / split) ─▶ ruta con
                          sucursales físicas, distancias y precios base
```

## Manejo de errores y casos borde

- **Maps no disponible y caché vacía:** `discoverPhysicalStores` devuelve `[]`;
  el optimizador devuelve `[]` (igual que hoy cuando no hay tiendas). La UI ya
  maneja "sin resultados".
- **Lugar sin cadena conocida:** se descarta (no hay precio base).
- **Cadena sin precio para un producto:** ese ítem cuenta como faltante en esa
  sucursal (lógica `missingItems` ya existente).
- **Geocerca / `prices.submit`:** sigue funcionando contra `storeId` físicos
  persistidos. Como las sucursales se descubren en vivo (sin fila en `stores`),
  la captura de precio por sucursal se persistirá de forma perezosa cuando se
  implemente (fuera de alcance de este spec): al guardar un precio se hará
  upsert de la sucursal en `stores` usando `placeId` como identidad y se
  enlazará vía `googlePlacesCache.storeId`. Este spec **no** rompe el flujo
  actual de `prices.submit` (sigue aceptando `storeId` existentes).

## Alcance

- **Incluye:** optimizador de ruta + buscador de tiendas (Stores/MapView).
- **No incluye:** captura de precios por sucursal física, persistencia perezosa de
  sucursales, ni barrido del resto del app. Las tiendas en línea **no se borran**:
  siguen siendo la fuente del precio base.

## Pruebas

- **Unit `chainMatch`:** nombres reales de Places → chainId esperado; nombres
  ajenos → null. (AAA, nombres descriptivos.)
- **Unit `storeDiscovery`:** con Maps mockeado, descarta lugares sin cadena,
  ordena por distancia; con Maps no disponible, usa caché.
- **Unit `smartCart`:** dado un set de sucursales físicas de varias cadenas y
  precios base por cadena, la ruta single/split usa precios correctos y
  distancias reales; nunca incluye una tienda "(en línea)".
- **Regresión UI:** Optimize muestra dirección real, sin "Compra en línea".
