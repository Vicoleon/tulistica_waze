/**
 * Chain-margin pricing fallback.
 *
 * STATUS: temporary. The seeded dataset only has reliable prices for the
 * Walmart chain. Until users start submitting geofence-validated price
 * reports per store, we synthesize prices for the other chains by applying
 * a margin discount to Walmart's price.
 *
 * Future work:
 *   - Once a user submits a price for a (store, product) pair that's
 *     verified by geofence, prefer that over the derived value.
 *   - Eventually persist the derived prices keyed by (lat, lng, productId)
 *     so the synthesis is a one-shot job rather than per-request math.
 *
 * Multipliers (vs Walmart baseline) confirmed by the user 2026-05-25:
 *   walmart      → 1.000   (base — 25–30% margin, trusted)
 *   mas-x-menos  → 0.945   (22% margin → ~5.5% cheaper)
 *   maxipali     → 0.905   (18% margin → ~9.5% cheaper)
 *   pali         → 0.835   (11% margin → ~16.5% cheaper)
 *   other chains → 1.000   (use Walmart price as-is until real reports land)
 */

export type PriceSource = "reported" | "estimated";

const CHAIN_MULTIPLIERS: Record<string, number> = {
  walmart: 1.0,
  "mas-x-menos": 0.945,
  masxmenos: 0.945, // tolerate both forms found in the seed
  maxipali: 0.905,
  pali: 0.835,
};

/** Returns the price multiplier to apply over a Walmart baseline. */
export function getChainMultiplier(chainId: string | null | undefined): number {
  if (!chainId) return 1.0;
  return CHAIN_MULTIPLIERS[chainId.toLowerCase()] ?? 1.0;
}

/** Round to nearest 5 colones — matches the seed data style. */
function roundColones(amount: number): number {
  return Math.round(amount / 5) * 5;
}

/**
 * Derive a chain-specific price from a Walmart baseline.
 * `chainId === 'walmart'` returns the input unchanged (no rounding distortion).
 */
export function derivePrice(
  walmartBasePrice: number,
  chainId: string | null | undefined
): number {
  if (!chainId || chainId.toLowerCase() === "walmart") return walmartBasePrice;
  return roundColones(walmartBasePrice * getChainMultiplier(chainId));
}

/**
 * True when a chain's price should always come from Walmart × multiplier
 * (until real user reports land). False when we let the existing scraped
 * priceEntry stand as-is — currently never, but exposed so the caller can
 * special-case if needed.
 */
export function isDerivedChain(chainId: string | null | undefined): boolean {
  return chainId?.toLowerCase() !== "walmart";
}

/** Friendly Spanish copy for the "estimated price" badge tooltip. */
export const ESTIMATED_PRICE_HINT =
  "Precio estimado a partir del margen de cada cadena. Recordá compartir el precio real cuando estés en el súper para que otros lo vean.";
