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

// Additional CR chains we don't have a derive-base price for, but that have
// real reported entries and shouldn't fragment in the comparison. Checked only
// after the base-price chains above. Patterns run against an ACCENT-STRIPPED,
// space-preserving haystack (see canonicalChainId), so they can stay ASCII and
// `\b` word boundaries work even for names like "Palí Heredia".
const EXTRA_CHAIN_PATTERNS: { chainId: string; pattern: RegExp }[] = [
  { chainId: "pali", pattern: /\bpali\b/ },
  { chainId: "perimercados", pattern: /perimercado/ },
  { chainId: "ampm", pattern: /\bam\s*\/?\s*pm\b/ },
  { chainId: "freshmarket", pattern: /fresh\s*market/ },
];

/** lowercase + strip accents, keep spaces. For word-boundary chain matching. */
function stripAccentsLower(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** lowercase, strip accents, drop non-alphanumerics → stable slug. */
function normalizeChainSlug(value: string): string {
  return stripAccentsLower(value).replace(/[^a-z0-9]/g, "");
}

/**
 * Collapse the un-normalized `stores.chainId` / store-name variants into ONE
 * canonical chain key, so "mas-x-menos", "masxmenos" and "más x menos" all
 * group together (and "palí"/"pali" likewise). Without this, "compare by
 * supermarket" fragments one chain into several near-empty buckets.
 *
 * Resolution order: known base-price chains (by name, then chainId) → extra CR
 * chains → normalized slug fallback.
 */
export function canonicalChainId(
  rawChainId: string | null | undefined,
  storeName?: string | null,
): string {
  const known =
    (storeName ? matchChain(storeName) : null) ??
    (rawChainId ? matchChain(rawChainId) : null);
  if (known) return known;

  const haystack = stripAccentsLower(`${storeName ?? ""} ${rawChainId ?? ""}`);
  for (const { chainId, pattern } of EXTRA_CHAIN_PATTERNS) {
    if (pattern.test(haystack)) return chainId;
  }

  if (rawChainId && rawChainId.trim()) return normalizeChainSlug(rawChainId);
  if (storeName && storeName.trim()) return normalizeChainSlug(storeName);
  return "otra";
}

/**
 * The supermarket chains worth surfacing in "compare by supermarket". Excludes
 * the long tail of independent corner stores from Google Places discovery so the
 * comparison stays a real chain-vs-chain decision, not 200 one-off shops.
 */
export const RECOGNIZED_CHAINS = new Set<string>([
  ...KNOWN_CHAINS,
  "pali",
  "perimercados",
  "ampm",
  "freshmarket",
]);

/** True when a canonical chainId is a recognized supermarket chain. */
export function isRecognizedChain(chainId: string): boolean {
  return RECOGNIZED_CHAINS.has(chainId);
}

/** True when a store row is one of our virtual online storefronts. */
export function isOnlineStoreName(name: string): boolean {
  return /\(en l[íi]nea\)/i.test(name);
}
