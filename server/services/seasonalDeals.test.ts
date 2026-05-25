import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  getMonthlyAveragePrices: vi.fn(),
  getCurrentLowestPrice: vi.fn(),
  getTrackedProductsForUser: vi.fn(),
  getPopularProductsForSeasonal: vi.fn(),
}));

import * as db from "../db";
import { predictForProduct, rankPredictions } from "./seasonalDeals";

const mocked = {
  monthly: vi.mocked(db.getMonthlyAveragePrices),
  current: vi.mocked(db.getCurrentLowestPrice),
};

describe("seasonalDeals.predictForProduct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns insufficient_data when there are fewer than 4 months of history", async () => {
    mocked.monthly.mockResolvedValue([
      { month: 1, avgPrice: 5, minPrice: 4, sampleCount: 2 },
      { month: 2, avgPrice: 5.2, minPrice: 4, sampleCount: 1 },
    ]);
    mocked.current.mockResolvedValue(5);

    const prediction = await predictForProduct(1, "Rice", "Grains");

    expect(prediction.signal).toBe("insufficient_data");
    expect(prediction.bestMonth).toBeNull();
    expect(prediction.monthlySeries).toHaveLength(2);
  });

  it("returns deal_window_now when current price is near the yearly low", async () => {
    mocked.monthly.mockResolvedValue([
      { month: 1, avgPrice: 10, minPrice: 10, sampleCount: 3 },
      { month: 2, avgPrice: 10, minPrice: 10, sampleCount: 3 },
      { month: 3, avgPrice: 9, minPrice: 9, sampleCount: 3 },
      { month: 4, avgPrice: 8, minPrice: 8, sampleCount: 3 },
      { month: 5, avgPrice: 7, minPrice: 7, sampleCount: 3 },
    ]);
    // Current price (7.2) is near the best month avg (7)
    mocked.current.mockResolvedValue(7.2);

    const prediction = await predictForProduct(2, "Tomatoes", "Produce");

    expect(prediction.signal).toBe("deal_window_now");
    expect(prediction.bestMonth?.avgPrice).toBeCloseTo(7);
    expect(prediction.worstMonth?.avgPrice).toBeCloseTo(10);
    expect(prediction.predictedDropPct).toBeGreaterThan(0.07);
  });

  it("classifies stable when price range is tight", async () => {
    mocked.monthly.mockResolvedValue([
      { month: 1, avgPrice: 10.0, minPrice: 10, sampleCount: 3 },
      { month: 2, avgPrice: 10.1, minPrice: 10, sampleCount: 3 },
      { month: 3, avgPrice: 10.2, minPrice: 10, sampleCount: 3 },
      { month: 4, avgPrice: 10.1, minPrice: 10, sampleCount: 3 },
      { month: 5, avgPrice: 10.0, minPrice: 10, sampleCount: 3 },
    ]);
    mocked.current.mockResolvedValue(10);

    const prediction = await predictForProduct(3, "Salt", "Condiments");

    expect(prediction.signal).toBe("stable");
    expect(prediction.predictedDropPct).toBeLessThan(0.07);
  });

  it("computes yearly average correctly", async () => {
    mocked.monthly.mockResolvedValue([
      { month: 1, avgPrice: 10, minPrice: 10, sampleCount: 3 },
      { month: 2, avgPrice: 20, minPrice: 20, sampleCount: 3 },
      { month: 3, avgPrice: 30, minPrice: 30, sampleCount: 3 },
      { month: 4, avgPrice: 40, minPrice: 40, sampleCount: 3 },
    ]);
    mocked.current.mockResolvedValue(25);

    const prediction = await predictForProduct(4, "Mixed", null);

    expect(prediction.yearlyAveragePrice).toBe(25);
    expect(prediction.bestMonth?.month).toBe(1);
    expect(prediction.worstMonth?.month).toBe(4);
  });
});

describe("seasonalDeals.rankPredictions", () => {
  it("orders deal_window_now first, then wait_for_drop, stable, insufficient_data", () => {
    const ranked = rankPredictions([
      makePrediction(1, "stable"),
      makePrediction(2, "deal_window_now"),
      makePrediction(3, "insufficient_data"),
      makePrediction(4, "wait_for_drop"),
    ]);
    expect(ranked.map((p) => p.signal)).toEqual([
      "deal_window_now",
      "wait_for_drop",
      "stable",
      "insufficient_data",
    ]);
  });

  it("breaks ties on predictedDropPct (higher first)", () => {
    const ranked = rankPredictions([
      makePrediction(1, "wait_for_drop", 0.1),
      makePrediction(2, "wait_for_drop", 0.3),
      makePrediction(3, "wait_for_drop", 0.2),
    ]);
    expect(ranked.map((p) => p.productId)).toEqual([2, 3, 1]);
  });
});

function makePrediction(
  productId: number,
  signal: "deal_window_now" | "wait_for_drop" | "stable" | "insufficient_data",
  dropPct = 0
) {
  return {
    productId,
    productName: `Product ${productId}`,
    category: null,
    signal,
    currentPrice: null,
    yearlyAveragePrice: 0,
    bestMonth: null,
    worstMonth: null,
    predictedDropPct: dropPct,
    monthsUntilBest: null,
    monthlySeries: [],
    rationale: "",
  };
}
