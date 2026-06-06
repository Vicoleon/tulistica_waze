/**
 * In-memory mock data used when DATABASE_URL points to no reachable MySQL.
 * Lets developers demo the full app (stores, products, lists, prices,
 * smart cart, map) without standing up a database.
 *
 * Mirrors `scripts/seed-minimal.ts` so dev mode and a fresh seeded DB show
 * the same baseline data. Mutations (createPriceEntry, addListItem, etc.)
 * are persisted into module-level Maps for the lifetime of the process.
 */

import type {
  Store, Product, ShoppingList, ListItem, PriceEntry,
} from "../../drizzle/schema";

// ============ STORES ============
export const mockStores: Store[] = [
  buildStore(1, "Walmart Escazú", "walmart", "Escazú, San José", "Escazú", 9.9282, -84.1393, "2208-1000", 4.2, 1500),
  buildStore(2, "Auto Mercado Plaza del Sol", "auto-mercado", "Curridabat, San José", "Curridabat", 9.9167, -84.0333, "2272-0800", 4.5, 950),
  buildStore(3, "Más x Menos San Pedro", "mas-x-menos", "San Pedro, San José", "San Pedro", 9.9333, -84.05, "2253-1100", 4.1, 780),
  buildStore(4, "Palí Heredia Centro", "pali", "Heredia Centro", "Heredia", 10.0024, -84.1165, "2262-2200", 3.9, 620),
  buildStore(5, "MaxiPalí Alajuela", "maxipali", "Alajuela Centro", "Alajuela", 10.0162, -84.2116, "2441-5500", 4.0, 540),
  buildStore(6, "PriceSmart Escazú", "pricesmart", "Escazú, San José", "Escazú", 9.9233, -84.1397, "2588-9900", 4.4, 2100),
  buildStore(7, "Fresh Market Multiplaza", "fresh-market", "Multiplaza Escazú", "Escazú", 9.9277, -84.1402, "2208-3500", 4.3, 410),
  buildStore(8, "Perimercados Tibás", "perimercados", "Tibás Centro", "Tibás", 9.9583, -84.0833, "2236-7700", 4.0, 280),
];

// ============ PRODUCTS ============
export const mockProducts: Product[] = [
  buildProduct(1, "7441001100017", "Arroz Tío Pelón 1kg", "Tío Pelón", "Granos", "kg", 1),
  buildProduct(2, "7441001200014", "Frijoles Negros Don Pedro 900g", "Don Pedro", "Granos", "kg", 0.9),
  buildProduct(3, "7441008100012", "Leche Dos Pinos Entera 1L", "Dos Pinos", "Lácteos", "L", 1),
  buildProduct(4, "7441009100019", "Café Britt Clásico 340g", "Café Britt", "Bebidas", "g", 340),
  buildProduct(5, "7441010100016", "Salsa Lizano 280ml", "Lizano", "Condimentos", "ml", 280),
  buildProduct(6, "7441008200019", "Natilla Dos Pinos 400g", "Dos Pinos", "Lácteos", "g", 400),
  buildProduct(7, "7501000100019", "Pan Bimbo Blanco 680g", "Bimbo", "Panadería", "g", 680),
  buildProduct(8, "7441014100014", "Huevos Don Cristóbal 12u", "Don Cristóbal", "Huevos", "unidades", 12),
  buildProduct(9, "7441015100011", "Aceite Clover 1L", "Clover", "Aceites", "L", 1),
  buildProduct(10, "7441016100018", "Azúcar Doña María 2kg", "Doña María", "Endulzantes", "kg", 2),
  buildProduct(11, "7441017100015", "Atún Sardimar 160g", "Sardimar", "Enlatados", "g", 160),
  buildProduct(12, "7441020100013", "Cerveza Imperial 350ml", "Imperial", "Bebidas Alcohólicas", "ml", 350),
];

const basePrices: Record<number, number> = {
  1: 1450, 2: 1850, 3: 1100, 4: 5200, 5: 1850, 6: 1450,
  7: 1750, 8: 2400, 9: 2950, 10: 2100, 11: 1100, 12: 850,
};

// Deterministic price spread per (storeId, productId): ±15% of base.
function priceFor(storeId: number, productId: number): number {
  const base = basePrices[productId] ?? 1000;
  // hash-like deterministic offset between -0.15 and +0.15
  const offset = (((storeId * 7 + productId * 13) % 31) / 100) - 0.15;
  return Math.round(base * (1 + offset) / 5) * 5;
}

export const mockPriceEntries: PriceEntry[] = (() => {
  const out: PriceEntry[] = [];
  let nextId = 1;
  for (const store of mockStores) {
    for (const product of mockProducts) {
      // Skip ~10% of (store, product) pairs to make missing items realistic.
      if ((store.id * 31 + product.id * 17) % 10 === 0) continue;
      out.push({
        id: nextId++,
        storeId: store.id,
        productId: product.id,
        userId: 0,
        price: priceFor(store.id, product.id),
        isVerified: true,
        isOutlier: false,
        voteCount: 0,
        confirmationCount: 0,
        submittedLatitude: null,
        submittedLongitude: null,
        withinGeofence: true,
        zScore: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }
  return out;
})();

// ============ DEMO SHOPPING LIST ============
// Pre-populated for user 1 (the MOCK_AUTH user) so /lists isn't empty.
const _demoListId = 1;
export const mockShoppingLists = new Map<number, ShoppingList>([
  [_demoListId, {
    id: _demoListId,
    name: "Sábado de mandado",
    ownerId: 1,
    isShared: false,
    shareCode: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }],
]);

export const mockListItems = new Map<number, ListItem[]>([
  [_demoListId, [
    buildListItem(1, _demoListId, 1, 1, "kg"),
    buildListItem(2, _demoListId, 2, 1, "kg"),
    buildListItem(3, _demoListId, 3, 2, "L"),
    buildListItem(4, _demoListId, 5, 1, "botella"),
    buildListItem(5, _demoListId, 8, 1, "docena"),
    buildListItem(6, _demoListId, 9, 1, "botella"),
  ]],
]);

let _nextListId = _demoListId + 1;
let _nextListItemId = 100;

export function nextListId(): number { return _nextListId++; }
export function nextListItemId(): number { return _nextListItemId++; }

// ============ DISTANCE HELPER ============
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ============ BUILDERS ============
function buildStore(
  id: number, name: string, chainId: string, address: string, city: string,
  latitude: number, longitude: number, phone: string, avgRating: number, totalRatings: number
): Store {
  return {
    id, name, chainId, address, city,
    state: "San José", zipCode: null,
    latitude, longitude, phone,
    hours: null, imageUrl: null,
    avgRating, totalRatings,
    isActive: true,
    brandId: null, // origin/main added vendor-claim support; not used in mocks
    placeId: null, // physical-branch identity; mocks are not Places-backed
    createdAt: new Date(), updatedAt: new Date(),
  };
}

function buildProduct(
  id: number, barcode: string, name: string, brand: string,
  category: string, unit: string, unitSize: number
): Product {
  return {
    id, barcode, name, brand,
    category, subcategory: null,
    description: null, imageUrl: null,
    unit, unitSize,
    isSponsored: false, sponsoredBid: 0,
    searchKeywords: null,
    createdByUserId: null, // seed products have no human creator
    createdAt: new Date(), updatedAt: new Date(),
  };
}

function buildListItem(
  id: number, listId: number, productId: number, quantity: number, unit: string
): ListItem {
  return {
    id, listId, productId,
    customName: null, quantity, unit,
    isChecked: false,
    checkedByUserId: null,
    checkedAt: null,
    addedByUserId: 1,
    notes: null,
    createdAt: new Date(), updatedAt: new Date(),
  };
}
