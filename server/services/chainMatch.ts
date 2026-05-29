/** Chains for which we currently have an online "base" price. */
export type KnownChainId =
  | "walmart"
  | "maxipali"
  | "masxmenos"
  | "automercado"
  | "pricesmart"
  | "megasuper";

export const KNOWN_CHAINS: KnownChainId[] = [
  "walmart",
  "maxipali",
  "masxmenos",
  "automercado",
  "pricesmart",
  "megasuper",
];

// Order: more specific brands before generic ones. MaxiPalí does not contain
// "walmart" in its name, so order is not strictly required, but kept explicit.
const CHAIN_PATTERNS: { chainId: KnownChainId; pattern: RegExp }[] = [
  { chainId: "maxipali", pattern: /maxi\s*pal[íi]/i },
  { chainId: "masxmenos", pattern: /m[áa]s\s*x\s*menos|masxmenos/i },
  { chainId: "automercado", pattern: /auto\s*mercado/i },
  { chainId: "pricesmart", pattern: /price\s*smart/i },
  { chainId: "megasuper", pattern: /mega\s*super/i },
  { chainId: "walmart", pattern: /walmart/i },
];

/** Map a Google Places store name to a known chainId, or null if unknown. */
export function matchChain(placeName: string): KnownChainId | null {
  for (const { chainId, pattern } of CHAIN_PATTERNS) {
    if (pattern.test(placeName)) return chainId;
  }
  return null;
}

/** True when a store row is one of our virtual online storefronts. */
export function isOnlineStoreName(name: string): boolean {
  return /\(en l[íi]nea\)/i.test(name);
}
