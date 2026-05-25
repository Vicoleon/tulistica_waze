/**
 * Minimal local seed — works without Google Maps API.
 * Inserts a curated set of Costa Rica stores and products so the UI is usable
 * for local testing without depending on external services.
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { stores, products, priceEntries, users } from "../drizzle/schema";

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required");
  process.exit(1);
}

const db = drizzle(process.env.DATABASE_URL);

const seedStores = [
  { name: "Walmart Escazú", chainId: "walmart", address: "Escazú, San José", city: "Escazú", latitude: 9.9282, longitude: -84.1393, phone: "2208-1000", avgRating: 4.2, totalRatings: 1500 },
  { name: "Auto Mercado Plaza del Sol", chainId: "auto-mercado", address: "Curridabat, San José", city: "Curridabat", latitude: 9.9167, longitude: -84.0333, phone: "2272-0800", avgRating: 4.5, totalRatings: 950 },
  { name: "Más x Menos San Pedro", chainId: "mas-x-menos", address: "San Pedro, San José", city: "San Pedro", latitude: 9.9333, longitude: -84.05, phone: "2253-1100", avgRating: 4.1, totalRatings: 780 },
  { name: "Palí Heredia Centro", chainId: "pali", address: "Heredia Centro", city: "Heredia", latitude: 10.0024, longitude: -84.1165, phone: "2262-2200", avgRating: 3.9, totalRatings: 620 },
  { name: "MaxiPalí Alajuela", chainId: "maxipali", address: "Alajuela Centro", city: "Alajuela", latitude: 10.0162, longitude: -84.2116, phone: "2441-5500", avgRating: 4.0, totalRatings: 540 },
  { name: "PriceSmart Escazú", chainId: "pricesmart", address: "Escazú, San José", city: "Escazú", latitude: 9.9233, longitude: -84.1397, phone: "2588-9900", avgRating: 4.4, totalRatings: 2100 },
  { name: "Fresh Market Multiplaza", chainId: "fresh-market", address: "Multiplaza Escazú", city: "Escazú", latitude: 9.9277, longitude: -84.1402, phone: "2208-3500", avgRating: 4.3, totalRatings: 410 },
  { name: "Perimercados Tibás", chainId: "perimercados", address: "Tibás Centro", city: "Tibás", latitude: 9.9583, longitude: -84.0833, phone: "2236-7700", avgRating: 4.0, totalRatings: 280 },
];

const seedProducts = [
  { barcode: "7441001100017", name: "Arroz Tío Pelón 1kg", brand: "Tío Pelón", category: "Granos", unit: "kg", unitSize: 1 },
  { barcode: "7441001200014", name: "Frijoles Negros Don Pedro 900g", brand: "Don Pedro", category: "Granos", unit: "kg", unitSize: 0.9 },
  { barcode: "7441008100012", name: "Leche Dos Pinos Entera 1L", brand: "Dos Pinos", category: "Lácteos", unit: "L", unitSize: 1 },
  { barcode: "7441009100019", name: "Café Britt Clásico 340g", brand: "Café Britt", category: "Bebidas", unit: "g", unitSize: 340 },
  { barcode: "7441010100016", name: "Salsa Lizano 280ml", brand: "Lizano", category: "Condimentos", unit: "ml", unitSize: 280 },
  { barcode: "7441008200019", name: "Natilla Dos Pinos 400g", brand: "Dos Pinos", category: "Lácteos", unit: "g", unitSize: 400 },
  { barcode: "7501000100019", name: "Pan Bimbo Blanco 680g", brand: "Bimbo", category: "Panadería", unit: "g", unitSize: 680 },
  { barcode: "7441014100014", name: "Huevos Don Cristóbal 12u", brand: "Don Cristóbal", category: "Huevos", unit: "unidades", unitSize: 12 },
  { barcode: "7441015100011", name: "Aceite Clover 1L", brand: "Clover", category: "Aceites", unit: "L", unitSize: 1 },
  { barcode: "7441016100018", name: "Azúcar Doña María 2kg", brand: "Doña María", category: "Endulzantes", unit: "kg", unitSize: 2 },
  { barcode: "7441017100015", name: "Atún Sardimar 160g", brand: "Sardimar", category: "Enlatados", unit: "g", unitSize: 160 },
  { barcode: "7441020100013", name: "Cerveza Imperial 350ml", brand: "Imperial", category: "Bebidas Alcohólicas", unit: "ml", unitSize: 350 },
];

/**
 * Realistic CR colones prices (May 2026 baseline). Each product gets a
 * different price at each store within ±15% of the baseline so the optimizer
 * has meaningful spreads to compare.
 */
const basePrices: Record<string, number> = {
  "7441001100017": 1450,
  "7441001200014": 1850,
  "7441008100012": 1100,
  "7441009100019": 5200,
  "7441010100016": 1850,
  "7441008200019": 1450,
  "7501000100019": 1750,
  "7441014100014": 2400,
  "7441015100011": 2950,
  "7441016100018": 2100,
  "7441017100015": 1100,
  "7441020100013": 850,
};

async function ensureSystemUser(): Promise<number> {
  await db
    .insert(users)
    .values({
      openId: "seed_system_user",
      name: "Seed System",
      email: "seed@grocerywaze.local",
      loginMethod: "seed",
      trustScore: 100,
    })
    .onDuplicateKeyUpdate({ set: { name: "Seed System" } });
  const rows = await db.select().from(users);
  const sys = rows.find((u) => u.openId === "seed_system_user");
  if (!sys) throw new Error("Seed user not created");
  return sys.id;
}

async function run() {
  console.log("Seeding stores...");
  for (const s of seedStores) {
    await db.insert(stores).values(s);
  }
  console.log(`  inserted ${seedStores.length} stores`);

  console.log("Seeding products...");
  for (const p of seedProducts) {
    await db.insert(products).values(p);
  }
  console.log(`  inserted ${seedProducts.length} products`);

  console.log("Seeding price entries...");
  const allStores = await db.select().from(stores);
  const allProducts = await db.select().from(products);
  const systemUserId = await ensureSystemUser();

  let priceCount = 0;
  for (const store of allStores) {
    for (const product of allProducts) {
      const base = product.barcode ? basePrices[product.barcode] : undefined;
      if (!base) continue;
      // ±15% variance per store, deterministic so seeds are stable
      const seed = (store.id * 17 + product.id * 31) % 100;
      const variance = (seed / 100 - 0.5) * 0.3;
      const price = Math.round(base * (1 + variance));
      await db.insert(priceEntries).values({
        storeId: store.id,
        productId: product.id,
        userId: systemUserId,
        price,
        isVerified: true,
        withinGeofence: true,
      });
      priceCount++;
    }
  }
  console.log(`  inserted ${priceCount} price entries`);

  console.log("\nDone. Stores:", allStores.length, "Products:", allProducts.length);
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
