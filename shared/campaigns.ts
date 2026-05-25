/**
 * Tulistica · sponsored placement surfaces.
 *
 * Each surface is a physical slot in the UI where a campaign can appear.
 * The campaign `type` column in ad_campaigns maps 1:1 to a surface.
 */

export const CAMPAIGN_SURFACES = [
  "dashboard_promo",
  "sponsored_search",
  "recipe_sponsored",
  "cart_suggestion",
  "banner",
] as const;
export type CampaignSurface = (typeof CAMPAIGN_SURFACES)[number];

/** Public shape returned to the client. Excludes admin-only fields. */
export interface CampaignPlacement {
  id: number;
  sponsor: string | null;
  type: CampaignSurface;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  targetUrl: string | null;
  productId: number | null;
}
