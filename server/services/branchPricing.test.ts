import { describe, expect, it } from "vitest";
import { resolveBranchPrices } from "./branchPricing";

describe("resolveBranchPrices", () => {
  const branches = [
    { storeId: 100, chainId: "walmart" },
    { storeId: 200, chainId: "maxipali" },
  ];
  const productIds = [1, 2];

  it("prefers a branch's own reported price over chain-online and estimate", () => {
    const out = resolveBranchPrices({
      branches,
      productIds,
      branchPrices: new Map([["100:1", 950]]),
      onlineChainPrices: new Map([["walmart:1", 1000], ["maxipali:1", 700]]),
      walmartBaseline: new Map([[1, 1000]]),
    });
    const w1 = out.find((r) => r.storeId === 100 && r.productId === 1)!;
    expect(w1).toMatchObject({ price: 950, source: "reported" });
  });

  it("falls back to the chain online price when no branch price exists", () => {
    const out = resolveBranchPrices({
      branches,
      productIds,
      branchPrices: new Map(),
      onlineChainPrices: new Map([["maxipali:1", 700]]),
      walmartBaseline: new Map([[1, 1000]]),
    });
    const m1 = out.find((r) => r.storeId === 200 && r.productId === 1)!;
    expect(m1).toMatchObject({ price: 700, source: "reported" });
  });

  it("derives from Walmart baseline × margin when chain has no online price", () => {
    const out = resolveBranchPrices({
      branches,
      productIds,
      branchPrices: new Map(),
      onlineChainPrices: new Map(),
      walmartBaseline: new Map([[1, 1000]]),
    });
    const m1 = out.find((r) => r.storeId === 200 && r.productId === 1)!;
    expect(m1).toMatchObject({ price: 905, source: "estimated" });
  });

  it("omits a (branch, product) with no signal at any level", () => {
    const out = resolveBranchPrices({
      branches,
      productIds: [2],
      branchPrices: new Map(),
      onlineChainPrices: new Map(),
      walmartBaseline: new Map(),
    });
    expect(out).toHaveLength(0);
  });
});
