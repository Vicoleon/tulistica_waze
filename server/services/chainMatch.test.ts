import { describe, expect, it } from "vitest";
import { matchChain, isOnlineStoreName } from "./chainMatch";

describe("chainMatch.matchChain", () => {
  it("matches Walmart branches", () => {
    expect(matchChain("Walmart Escazú")).toBe("walmart");
  });

  it("matches MaxiPalí with and without accent", () => {
    expect(matchChain("MaxiPalí Guadalupe")).toBe("maxipali");
    expect(matchChain("Maxi Pali Heredia")).toBe("maxipali");
  });

  it("matches Más x Menos, Auto Mercado, PriceSmart, MegaSuper", () => {
    expect(matchChain("Más x Menos San Pedro")).toBe("masxmenos");
    expect(matchChain("Auto Mercado Rohrmoser")).toBe("automercado");
    expect(matchChain("PriceSmart Tibás")).toBe("pricesmart");
    expect(matchChain("MegaSuper Cartago")).toBe("megasuper");
  });

  it("returns null for unknown chains", () => {
    expect(matchChain("Pulpería La Esquina")).toBeNull();
    expect(matchChain("Fresh Market")).toBeNull();
  });
});

describe("chainMatch.isOnlineStoreName", () => {
  it("detects the (en línea) suffix", () => {
    expect(isOnlineStoreName("MaxiPalí (en línea)")).toBe(true);
    expect(isOnlineStoreName("Walmart (en linea)")).toBe(true);
  });

  it("is false for physical store names", () => {
    expect(isOnlineStoreName("Walmart Escazú")).toBe(false);
  });
});
