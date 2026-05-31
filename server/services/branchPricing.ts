import { derivePrice } from "./pricingFallback";

export type PriceSource = "reported" | "estimated";

export interface BranchPriceInputs {
  branches: { storeId: number; chainId: string }[];
  productIds: number[];
  /** key `${storeId}:${productId}` -> price (user-reported, geofenced). */
  branchPrices: Map<string, number>;
  /** key `${chainId}:${productId}` -> chain online base price. */
  onlineChainPrices: Map<string, number>;
  /** productId -> Walmart baseline price. */
  walmartBaseline: Map<number, number>;
}

export interface BranchPrice {
  storeId: number;
  productId: number;
  price: number;
  source: PriceSource;
}

/**
 * Resolve the price for each (branch, product) by precedence:
 *   1. the branch's own reported price            -> reported
 *   2. the chain's online base price              -> reported
 *   3. Walmart baseline × chain margin (derive)   -> estimated
 *   4. nothing -> omit (Smart Cart treats as missing)
 */
export function resolveBranchPrices(inputs: BranchPriceInputs): BranchPrice[] {
  const { branches, productIds, branchPrices, onlineChainPrices, walmartBaseline } = inputs;
  const out: BranchPrice[] = [];
  for (const branch of branches) {
    for (const productId of productIds) {
      const own = branchPrices.get(`${branch.storeId}:${productId}`);
      if (own !== undefined) {
        out.push({ storeId: branch.storeId, productId, price: own, source: "reported" });
        continue;
      }
      const online = onlineChainPrices.get(`${branch.chainId}:${productId}`);
      if (online !== undefined) {
        out.push({ storeId: branch.storeId, productId, price: online, source: "reported" });
        continue;
      }
      const base = walmartBaseline.get(productId);
      if (base !== undefined) {
        out.push({
          storeId: branch.storeId,
          productId,
          price: derivePrice(base, branch.chainId),
          source: "estimated",
        });
      }
    }
  }
  return out;
}
