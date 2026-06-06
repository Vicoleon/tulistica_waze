import { describe, expect, it } from "vitest";
import {
  matchChain,
  isOnlineStoreName,
  canonicalChainId,
  isRecognizedChain,
} from "./chainMatch";

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

describe("chainMatch.canonicalChainId", () => {
  it("collapses Más x Menos variants to one canonical key", () => {
    expect(canonicalChainId("mas-x-menos")).toBe("masxmenos");
    expect(canonicalChainId("masxmenos")).toBe("masxmenos");
    expect(canonicalChainId("más x menos")).toBe("masxmenos");
    // Resolves from the store name when chainId is missing.
    expect(canonicalChainId(null, "Más x Menos San Pedro")).toBe("masxmenos");
  });

  it("collapses standalone Palí variants to 'pali'", () => {
    expect(canonicalChainId("pali")).toBe("pali");
    // "palí" (accented) resolves to "pali" too (haystack is accent-stripped).
    expect(canonicalChainId("palí")).toBe("pali");
    // Non-accented multi-word names collapse via the EXTRA pattern.
    expect(canonicalChainId(null, "Pali Heredia")).toBe("pali");
  });

  it("collapses accented multi-word 'Palí Heredia' to 'pali'", () => {
    // Regression: the EXTRA patterns run on an accent-stripped, space-preserving
    // haystack so `\bpali\b` matches even after the non-ASCII "í".
    expect(canonicalChainId(null, "Palí Heredia")).toBe("pali");
  });

  it("matches MaxiPalí from a store name (base-price chain wins over Palí)", () => {
    expect(canonicalChainId(null, "MaxiPalí Alajuela")).toBe("maxipali");
  });

  it("falls back to a normalized slug for an unknown shop", () => {
    const slug = canonicalChainId("Yohan");
    expect(slug).toBe("yohan");
    expect(isRecognizedChain(slug)).toBe(false);
  });

  it("returns 'otra' for null/empty input", () => {
    expect(canonicalChainId(null)).toBe("otra");
    expect(canonicalChainId("")).toBe("otra");
    expect(canonicalChainId("   ", "  ")).toBe("otra");
  });
});

describe("chainMatch.isRecognizedChain", () => {
  it("is true for the six base-price chains plus 'pali'", () => {
    for (const id of [
      "walmart",
      "maxipali",
      "masxmenos",
      "automercado",
      "pricesmart",
      "megasuper",
      "pali",
    ]) {
      expect(isRecognizedChain(id)).toBe(true);
    }
  });

  it("is false for an independent / unknown slug", () => {
    expect(isRecognizedChain("yohan")).toBe(false);
    expect(isRecognizedChain("otra")).toBe(false);
  });
});
