/**
 * Canonical supermarket-chain display names, shared by client and server so the
 * "compare by supermarket" surfaces never hand-format a chainId.
 *
 * Keys are lowercase chainIds as stored on `stores.chainId` (see
 * server/services/chainMatch.ts KNOWN_CHAINS). Add new chains here when the
 * pricing layer starts producing prices for them.
 */
export const CHAIN_DISPLAY_NAMES: Record<string, string> = {
  walmart: "Walmart",
  maxipali: "MaxiPalí",
  pali: "Palí",
  masxmenos: "Más x Menos",
  automercado: "Auto Mercado",
  pricesmart: "PriceSmart",
  megasuper: "Megasuper",
  perimercados: "Perimercados",
  ampm: "AM PM",
  freshmarket: "Fresh Market",
  otra: "Otra tienda",
};

/** Human-facing name for a chainId, with a graceful fallback. */
export function chainDisplayName(chainId: string | null | undefined): string {
  if (!chainId) return "Otra tienda";
  return CHAIN_DISPLAY_NAMES[chainId.toLowerCase()] ?? chainId;
}
