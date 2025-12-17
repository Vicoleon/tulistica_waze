import { drizzle } from "drizzle-orm/mysql2";
import { priceEntries, products, stores } from "../drizzle/schema";
import { sql } from "drizzle-orm";

async function seedPrices() {
  const db = drizzle(process.env.DATABASE_URL!);
  
  // Get all products
  const allProducts = await db.select().from(products);
  console.log(`Found ${allProducts.length} products`);
  
  // Get all stores
  const allStores = await db.select().from(stores);
  console.log(`Found ${allStores.length} stores`);
  
  if (allProducts.length === 0 || allStores.length === 0) {
    console.log("No products or stores found. Run the seed-costa-rica script first.");
    process.exit(1);
  }
  
  // Base prices for Costa Rican products (in colones, roughly)
  const basePrices: Record<string, number> = {
    "Arroz Tío Pelón": 2500,
    "Frijoles Negros Don Pedro": 1800,
    "Café Britt Clásico": 5500,
    "Leche Dos Pinos": 1200,
    "Natilla Dos Pinos": 1500,
    "Queso Turrialba": 3500,
    "Salsa Lizano": 2200,
    "Gallo Pinto Mix": 1600,
    "Tortillas de Maíz": 800,
    "Pan Bimbo Integral": 2800,
    "Atún Sardimar": 1900,
    "Aceite Clover": 3200,
    "Azúcar Doña María": 1400,
    "Sal Refinada": 600,
    "Huevos (docena)": 2400,
    "Bananos (kg)": 500,
    "Tomates (kg)": 1200,
    "Cebolla (kg)": 900,
    "Papa (kg)": 800,
    "Pollo Entero (kg)": 3500,
  };
  
  let priceCount = 0;
  const userId = 1; // System user
  
  // Add prices for each product at random stores
  for (const product of allProducts) {
    const basePrice = basePrices[product.name] || 2000;
    
    // Select random stores (30-50% of stores will have this product)
    const numStores = Math.floor(allStores.length * (0.3 + Math.random() * 0.2));
    const shuffledStores = [...allStores].sort(() => Math.random() - 0.5).slice(0, numStores);
    
    for (const store of shuffledStores) {
      // Add some price variation (-15% to +20%)
      const variation = 0.85 + Math.random() * 0.35;
      const price = Math.round(basePrice * variation);
      
      try {
        await db.insert(priceEntries).values({
          storeId: store.id,
          productId: product.id,
          userId,
          price,
          isVerified: Math.random() > 0.3, // 70% verified
          withinGeofence: true,
          submittedLatitude: store.latitude,
          submittedLongitude: store.longitude,
        });
        priceCount++;
      } catch (e) {
        // Skip duplicates
      }
    }
    console.log(`Added prices for ${product.name} at ${shuffledStores.length} stores`);
  }
  
  console.log(`\n✅ Seeded ${priceCount} price entries`);
  process.exit(0);
}

seedPrices().catch(console.error);
