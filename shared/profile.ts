/**
 * Tulistica · ShopperProfile
 *
 * Per-user profile built during the onboarding flow (Onboarding.tsx, 7
 * questions). Lives inside `users.preferences.shopperProfile` (JSON column)
 * so we can ship without a schema migration. Migrate to a dedicated table
 * once we need to query users by tier.
 *
 * Used downstream to:
 *  - default the store list / map filters to `preferredChains`
 *  - bias Smart Cart between "split route to save" and "single store to be fast"
 *  - scale recipe quantities to household size
 *  - throttle push notification cadence
 */

// ============ Answer enums ============

export const HOUSEHOLD_SIZES = ["1", "2", "3-4", "5+"] as const;
export type HouseholdSize = (typeof HOUSEHOLD_SIZES)[number];

export const SHOPPING_CADENCES = [
  "weekly",
  "biweekly",
  "monthly",
  "frequent",
] as const;
export type ShoppingCadence = (typeof SHOPPING_CADENCES)[number];

export const STORE_PREFERENCES = [
  "walmart",
  "maxipali",
  "pali",
  "automercado",
  "pricesmart",
  "masxmenos",
  "megasuper",
  "ferias",
  "pulperia",
  "otra",
] as const;
export type StorePreference = (typeof STORE_PREFERENCES)[number];

// Refined Q4 (see TULISTICA_PRODUCT_NOTES.md §2)
export const SHOPPING_PRIORITIES = [
  "precio_bajo",
  "promociones",
  "frescos",
  "variedad",
  "cercania",
  "por_mayor",
] as const;
export type ShoppingPriority = (typeof SHOPPING_PRIORITIES)[number];

// Refined Q5 — pure category, no tier signal
export const BASKET_CATEGORIES = [
  "frescos",
  "granos",
  "procesados",
  "congelados",
  "snacks",
  "saludable",
  "limpieza",
] as const;
export type BasketCategory = (typeof BASKET_CATEGORIES)[number];

export const ZONES = [
  "san_jose",
  "escazu",
  "santa_ana",
  "heredia",
  "alajuela",
  "cartago",
  "curridabat",
  "tibas",
  "desamparados",
  "liberia",
  "otra",
] as const;
export type Zone = (typeof ZONES)[number];

// Derived tier — never asked, always computed by `derivePriceTier`.
export type PriceTier = "value" | "mid" | "premium";

// ============ Profile shape ============

export type ShopperProfile = {
  householdSize: HouseholdSize;
  shoppingCadence: ShoppingCadence;
  preferredChains: StorePreference[];
  shoppingPriorities: ShoppingPriority[]; // max 3
  basketMix: BasketCategory[]; // max 3
  /** Optional — filled later via geolocation or address form, not during onboarding. */
  zone?: Zone;
  /** 0 = "ahorrá lo más posible", 100 = "que sea rápido y cerca" */
  savingsVsTimeBias: number;
  /** Derived — never set directly. */
  priceTier: PriceTier;
  /** ISO timestamp. Presence == user has completed onboarding. */
  onboardedAt: string;
};

/** Input from the onboarding form — server computes priceTier + onboardedAt. */
export type ShopperProfileInput = Omit<
  ShopperProfile,
  "priceTier" | "onboardedAt"
>;

/** Full preferences JSON we store in `users.preferences`. */
export type UserPreferences = {
  dietaryRestrictions?: string[];
  favoriteStores?: number[];
  shopperProfile?: ShopperProfile;
  // Budget tracker (Tulistica feature)
  monthlyBudget?: number;
  budgetAlertThreshold?: number;
  budgetCycleStartDay?: number;
};

// ============ Helpers ============

/**
 * Compute price tier from preferred chains + priorities. Pure function —
 * easy to unit-test and keep in sync between client preview and server save.
 *
 *   value   → MaxiPalí / Palí dominant + precio_bajo prioritized
 *   premium → AutoMercado / PriceSmart dominant + variedad/frescos prioritized
 *   mid     → everything in between (default)
 */
export function derivePriceTier(
  chains: StorePreference[],
  priorities: ShoppingPriority[]
): PriceTier {
  const valueChains: StorePreference[] = ["pali", "maxipali"];
  const premiumChains: StorePreference[] = ["automercado", "pricesmart"];

  const valueChainHits = chains.filter((c) => valueChains.includes(c)).length;
  const premiumChainHits = chains.filter((c) =>
    premiumChains.includes(c)
  ).length;

  const hasValuePriority =
    priorities.includes("precio_bajo") ||
    priorities.includes("promociones");
  const hasPremiumPriority =
    priorities.includes("variedad") ||
    priorities.includes("frescos") ||
    priorities.includes("por_mayor");

  // Strong value signal
  if (valueChainHits > 0 && premiumChainHits === 0 && hasValuePriority) {
    return "value";
  }
  // Strong premium signal
  if (premiumChainHits > 0 && valueChainHits === 0 && hasPremiumPriority) {
    return "premium";
  }
  // Bias by majority of chain choice
  if (valueChainHits > premiumChainHits + 1) return "value";
  if (premiumChainHits > valueChainHits + 1) return "premium";
  return "mid";
}

/** Type-guard for runtime data coming from the DB JSON column. */
export function hasCompletedOnboarding(
  prefs: UserPreferences | null | undefined
): prefs is UserPreferences & { shopperProfile: ShopperProfile } {
  return Boolean(
    prefs?.shopperProfile?.onboardedAt &&
      typeof prefs.shopperProfile.onboardedAt === "string"
  );
}
