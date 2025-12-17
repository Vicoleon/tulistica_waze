/**
 * Seed script to populate the database with grocery stores from Costa Rica
 * Uses Google Maps Places API via Manus proxy
 */

import { drizzle } from "drizzle-orm/mysql2";
import { stores, products } from "../drizzle/schema.js";
import dotenv from "dotenv";

dotenv.config();

const db = drizzle(process.env.DATABASE_URL);

// Costa Rica major cities and areas with coordinates
const costaRicaLocations = [
  { name: "San José Centro", lat: 9.9281, lng: -84.0907 },
  { name: "Escazú", lat: 9.9233, lng: -84.1397 },
  { name: "Santa Ana", lat: 9.9325, lng: -84.1826 },
  { name: "Heredia", lat: 10.0024, lng: -84.1165 },
  { name: "Alajuela", lat: 10.0162, lng: -84.2116 },
  { name: "Cartago", lat: 9.8644, lng: -83.9194 },
  { name: "Liberia", lat: 10.6346, lng: -85.4407 },
  { name: "Puntarenas", lat: 9.9762, lng: -84.8383 },
  { name: "Limón", lat: 9.9907, lng: -83.0359 },
  { name: "San Pedro", lat: 9.9333, lng: -84.0500 },
  { name: "Curridabat", lat: 9.9167, lng: -84.0333 },
  { name: "Tibás", lat: 9.9583, lng: -84.0833 },
  { name: "Moravia", lat: 9.9583, lng: -84.0500 },
  { name: "Guadalupe", lat: 9.9500, lng: -84.0583 },
  { name: "Desamparados", lat: 9.8994, lng: -84.0631 },
];

// Google Maps API via Manus proxy
const MAPS_API_URL = process.env.BUILT_IN_FORGE_API_URL;
const MAPS_API_KEY = process.env.BUILT_IN_FORGE_API_KEY;

async function searchNearbyStores(lat, lng, radius = 5000) {
  const url = `${MAPS_API_URL}/maps/api/place/nearbysearch/json`;
  const params = new URLSearchParams({
    location: `${lat},${lng}`,
    radius: radius.toString(),
    type: "supermarket",
    keyword: "supermercado grocery",
  });

  try {
    const response = await fetch(`${url}?${params}`, {
      headers: {
        Authorization: `Bearer ${MAPS_API_KEY}`,
      },
    });
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error(`Error fetching stores for ${lat},${lng}:`, error.message);
    return [];
  }
}

async function getPlaceDetails(placeId) {
  const url = `${MAPS_API_URL}/maps/api/place/details/json`;
  const params = new URLSearchParams({
    place_id: placeId,
    fields: "name,formatted_address,formatted_phone_number,website,opening_hours,geometry,rating,user_ratings_total",
  });

  try {
    const response = await fetch(`${url}?${params}`, {
      headers: {
        Authorization: `Bearer ${MAPS_API_KEY}`,
      },
    });
    const data = await response.json();
    return data.result || null;
  } catch (error) {
    console.error(`Error fetching details for ${placeId}:`, error.message);
    return null;
  }
}

async function seedStores() {
  console.log("🇨🇷 Starting Costa Rica grocery store seed...\n");

  const allStores = new Map(); // Use Map to deduplicate by place_id

  for (const location of costaRicaLocations) {
    console.log(`📍 Searching in ${location.name}...`);
    const results = await searchNearbyStores(location.lat, location.lng);
    
    for (const place of results) {
      if (!allStores.has(place.place_id)) {
        allStores.set(place.place_id, {
          placeId: place.place_id,
          name: place.name,
          address: place.vicinity,
          latitude: place.geometry.location.lat,
          longitude: place.geometry.location.lng,
          rating: place.rating || null,
          totalRatings: place.user_ratings_total || 0,
        });
      }
    }
    
    console.log(`   Found ${results.length} stores (${allStores.size} unique total)`);
    
    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log(`\n📦 Inserting ${allStores.size} unique stores into database...\n`);

  let inserted = 0;
  let skipped = 0;

  for (const [placeId, store] of allStores) {
    try {
      // Get additional details
      const details = await getPlaceDetails(placeId);
      
      const storeData = {
        name: store.name,
        chain: detectChain(store.name),
        address: details?.formatted_address || store.address,
        city: extractCity(details?.formatted_address || store.address),
        country: "Costa Rica",
        latitude: store.latitude,
        longitude: store.longitude,
        phone: details?.formatted_phone_number || null,
        website: details?.website || null,
        avgRating: store.rating,
        totalRatings: store.totalRatings,
        googlePlaceId: placeId,
        isVerified: true,
      };

      await db.insert(stores).values(storeData).onDuplicateKeyUpdate({
        set: {
          avgRating: storeData.avgRating,
          totalRatings: storeData.totalRatings,
          phone: storeData.phone,
          website: storeData.website,
        },
      });
      
      inserted++;
      console.log(`✅ ${store.name} - ${storeData.city || 'Unknown'}`);
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      skipped++;
      console.log(`⚠️ Skipped ${store.name}: ${error.message}`);
    }
  }

  console.log(`\n🎉 Seed complete!`);
  console.log(`   Inserted: ${inserted} stores`);
  console.log(`   Skipped: ${skipped} stores`);
}

function detectChain(name) {
  const nameLower = name.toLowerCase();
  
  // Costa Rica supermarket chains
  if (nameLower.includes("walmart") || nameLower.includes("wal-mart")) return "Walmart";
  if (nameLower.includes("automercado")) return "Auto Mercado";
  if (nameLower.includes("mas x menos") || nameLower.includes("masxmenos")) return "Mas x Menos";
  if (nameLower.includes("palí") || nameLower.includes("pali")) return "Palí";
  if (nameLower.includes("megasuper")) return "MegaSuper";
  if (nameLower.includes("perimercados")) return "Perimercados";
  if (nameLower.includes("freshmarket") || nameLower.includes("fresh market")) return "Fresh Market";
  if (nameLower.includes("pricesmart")) return "PriceSmart";
  if (nameLower.includes("pequeño mundo")) return "Pequeño Mundo";
  if (nameLower.includes("maxipali") || nameLower.includes("maxi palí")) return "MaxiPalí";
  if (nameLower.includes("am pm") || nameLower.includes("ampm")) return "AM PM";
  if (nameLower.includes("musmanni")) return "Musmanni";
  
  return null;
}

function extractCity(address) {
  if (!address) return null;
  
  // Common Costa Rica cities
  const cities = [
    "San José", "Escazú", "Santa Ana", "Heredia", "Alajuela", 
    "Cartago", "Liberia", "Puntarenas", "Limón", "San Pedro",
    "Curridabat", "Tibás", "Moravia", "Guadalupe", "Desamparados",
    "Tres Ríos", "La Unión", "Zapote", "San Francisco", "Rohrmoser"
  ];
  
  for (const city of cities) {
    if (address.includes(city)) return city;
  }
  
  return null;
}

// Sample products commonly found in Costa Rica
async function seedProducts() {
  console.log("\n📦 Adding sample products...\n");
  
  const sampleProducts = [
    { name: "Arroz Tío Pelón", brand: "Tío Pelón", category: "Granos", barcode: "7441001100017", unit: "kg", unitSize: 1 },
    { name: "Frijoles Negros Don Pedro", brand: "Don Pedro", category: "Granos", barcode: "7441001200014", unit: "kg", unitSize: 0.9 },
    { name: "Leche Dos Pinos Entera", brand: "Dos Pinos", category: "Lácteos", barcode: "7441008100012", unit: "L", unitSize: 1 },
    { name: "Café Britt Clásico", brand: "Café Britt", category: "Bebidas", barcode: "7441009100019", unit: "g", unitSize: 340 },
    { name: "Salsa Lizano", brand: "Lizano", category: "Condimentos", barcode: "7441010100016", unit: "ml", unitSize: 280 },
    { name: "Natilla Dos Pinos", brand: "Dos Pinos", category: "Lácteos", barcode: "7441008200019", unit: "g", unitSize: 400 },
    { name: "Tortillas de Maíz Mexifoods", brand: "Mexifoods", category: "Panadería", barcode: "7441011100013", unit: "unidades", unitSize: 10 },
    { name: "Queso Turrialba", brand: "Dos Pinos", category: "Lácteos", barcode: "7441008300016", unit: "g", unitSize: 500 },
    { name: "Gallo Pinto Listo", brand: "Sabemas", category: "Preparados", barcode: "7441012100010", unit: "g", unitSize: 400 },
    { name: "Jugo de Naranja Del Campo", brand: "Del Campo", category: "Bebidas", barcode: "7441013100017", unit: "L", unitSize: 1 },
    { name: "Pan Bimbo Blanco", brand: "Bimbo", category: "Panadería", barcode: "7501000100019", unit: "g", unitSize: 680 },
    { name: "Huevos Don Cristóbal", brand: "Don Cristóbal", category: "Huevos", barcode: "7441014100014", unit: "unidades", unitSize: 12 },
    { name: "Aceite Clover", brand: "Clover", category: "Aceites", barcode: "7441015100011", unit: "L", unitSize: 1 },
    { name: "Azúcar Doña María", brand: "Doña María", category: "Endulzantes", barcode: "7441016100018", unit: "kg", unitSize: 2 },
    { name: "Atún Sardimar", brand: "Sardimar", category: "Enlatados", barcode: "7441017100015", unit: "g", unitSize: 160 },
    { name: "Pasta Dental Colgate", brand: "Colgate", category: "Higiene", barcode: "7891024100011", unit: "ml", unitSize: 90 },
    { name: "Jabón Palmolive", brand: "Palmolive", category: "Higiene", barcode: "7891024200018", unit: "g", unitSize: 150 },
    { name: "Detergente Fab", brand: "Fab", category: "Limpieza", barcode: "7441018100012", unit: "kg", unitSize: 1 },
    { name: "Papel Higiénico Scott", brand: "Scott", category: "Hogar", barcode: "7441019100019", unit: "rollos", unitSize: 12 },
    { name: "Cerveza Imperial", brand: "Imperial", category: "Bebidas Alcohólicas", barcode: "7441020100013", unit: "ml", unitSize: 350 },
  ];

  let inserted = 0;
  for (const product of sampleProducts) {
    try {
      await db.insert(products).values(product).onDuplicateKeyUpdate({
        set: { name: product.name },
      });
      inserted++;
      console.log(`✅ ${product.name}`);
    } catch (error) {
      console.log(`⚠️ Skipped ${product.name}: ${error.message}`);
    }
  }

  console.log(`\n🎉 Added ${inserted} products`);
}

async function main() {
  try {
    await seedStores();
    await seedProducts();
    console.log("\n✨ All done! Your database is now populated with Costa Rica data.");
    process.exit(0);
  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

main();
