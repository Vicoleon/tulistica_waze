/**
 * Tulistica analytics · canonical event names.
 *
 * Add new names here so the client and server share a single source of truth.
 * The string values are what land in the DB — never rename without a migration
 * plan, only deprecate + add a new name.
 */

export const ANALYTICS_EVENTS = {
  // ============ Onboarding funnel ============
  ONBOARDING_STARTED: "onboarding_started",
  ONBOARDING_STEP_COMPLETED: "onboarding_step_completed",
  ONBOARDING_SKIPPED: "onboarding_skipped",
  ONBOARDING_COMPLETED: "onboarding_completed",

  // ============ List flow ============
  LIST_CREATED: "list_created",
  LIST_ITEM_ADDED: "list_item_added",
  LIST_ITEM_TOGGLED: "list_item_toggled",
  LIST_OPTIMIZED: "list_optimized",
  LIST_SHARED: "list_shared",

  // ============ Discovery / search ============
  PRODUCT_SEARCH: "product_search",
  PRODUCT_CLICKED: "product_clicked",
  STORE_VIEWED: "store_viewed",
  MAP_VIEWED: "map_viewed",

  // ============ Recipes ============
  RECIPE_VIEWED: "recipe_viewed",
  RECIPE_IMPORTED: "recipe_imported",
  RECIPE_ADDED_TO_LIST: "recipe_added_to_list",

  // ============ Community ============
  PRICE_REPORTED: "price_reported",
  SCANNER_USED: "scanner_used",

  // ============ Alerts ============
  ALERT_CREATED: "alert_created",
  ALERT_TRIGGERED: "alert_triggered",
  NOTIFICATION_CLICKED: "notification_clicked",
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

/**
 * Reserved property keys we always want consistent shapes for. Free-form keys
 * are still allowed in `properties` — these are just the ones we filter on
 * regularly so we standardize names.
 */
export interface AnalyticsCommonProps {
  source?: string; // "search" | "recipe" | "scan" | "manual" | "alert"
  position?: number;
  isSponsored?: boolean;
  productId?: number | null;
  storeId?: number | null;
  recipeId?: number | null;
  listId?: number | null;
  alertId?: number | null;
  query?: string;
  resultsCount?: number;
  savedAmount?: number | null;
}

export type AnalyticsProperties = AnalyticsCommonProps &
  Record<string, unknown>;
