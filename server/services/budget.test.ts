import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../db", () => ({
  getUserBudget: vi.fn(),
  getSpendingSinceCycleStart: vi.fn(),
  getSpendingByCategory: vi.fn(),
  getSpendingByStore: vi.fn(),
  getDailySpendingTrend: vi.fn(),
}));

import * as db from "../db";
import { computeBudgetInsights } from "./budget";

const m = {
  budget: vi.mocked(db.getUserBudget),
  summary: vi.mocked(db.getSpendingSinceCycleStart),
  cats: vi.mocked(db.getSpendingByCategory),
  stores: vi.mocked(db.getSpendingByStore),
  trend: vi.mocked(db.getDailySpendingTrend),
};

function noData() {
  m.summary.mockResolvedValue({ total: 0, transactionCount: 0 });
  m.cats.mockResolvedValue([]);
  m.stores.mockResolvedValue([]);
  m.trend.mockResolvedValue([]);
}

describe("budget.computeBudgetInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noData();
  });

  it("returns no_budget status when user has no budget set", async () => {
    m.budget.mockResolvedValue(null);

    const insights = await computeBudgetInsights(1);

    expect(insights.status).toBe("no_budget");
    expect(insights.settings).toBeNull();
    expect(insights.topInsight).toMatch(/Set a monthly budget/i);
  });

  it("returns on_track when spending is below threshold and projection is safe", async () => {
    m.budget.mockResolvedValue({
      monthlyBudget: 1000,
      budgetAlertThreshold: 0.8,
      budgetCycleStartDay: 1,
    });
    m.summary.mockResolvedValue({ total: 100, transactionCount: 2 });

    const insights = await computeBudgetInsights(1);

    expect(insights.status).toBe("on_track");
    expect(insights.spent).toBe(100);
    expect(insights.remaining).toBe(900);
  });

  it("returns over_budget when spent exceeds the budget", async () => {
    m.budget.mockResolvedValue({
      monthlyBudget: 100,
      budgetAlertThreshold: 0.8,
      budgetCycleStartDay: 1,
    });
    m.summary.mockResolvedValue({ total: 120, transactionCount: 5 });

    const insights = await computeBudgetInsights(1);

    expect(insights.status).toBe("over_budget");
    expect(insights.remaining).toBe(0);
    expect(insights.topInsight).toMatch(/over your/i);
  });

  it("returns approaching_limit when crossing the alert threshold", async () => {
    m.budget.mockResolvedValue({
      monthlyBudget: 100,
      budgetAlertThreshold: 0.8,
      budgetCycleStartDay: 1,
    });
    m.summary.mockResolvedValue({ total: 85, transactionCount: 8 });

    const insights = await computeBudgetInsights(1);

    expect(insights.status).toBe("approaching_limit");
  });

  it("aggregates category percentages from spent totals", async () => {
    m.budget.mockResolvedValue({
      monthlyBudget: 1000,
      budgetAlertThreshold: 0.8,
      budgetCycleStartDay: 1,
    });
    m.summary.mockResolvedValue({ total: 200, transactionCount: 4 });
    m.cats.mockResolvedValue([
      { category: "Produce", spent: 150, itemCount: 6 },
      { category: "Dairy", spent: 50, itemCount: 2 },
    ]);

    const insights = await computeBudgetInsights(1);

    expect(insights.byCategory).toHaveLength(2);
    expect(insights.byCategory[0].pctOfTotal).toBeCloseTo(0.75);
    expect(insights.byCategory[1].pctOfTotal).toBeCloseTo(0.25);
  });

  it("computes a cumulative trend from per-day spend", async () => {
    m.budget.mockResolvedValue({
      monthlyBudget: 500,
      budgetAlertThreshold: 0.8,
      budgetCycleStartDay: 1,
    });
    m.summary.mockResolvedValue({ total: 90, transactionCount: 3 });
    m.trend.mockResolvedValue([
      { day: "2026-05-01", spent: 30 },
      { day: "2026-05-02", spent: 20 },
      { day: "2026-05-03", spent: 40 },
    ]);

    const insights = await computeBudgetInsights(1);

    expect(insights.trend.map((p) => p.cumulative)).toEqual([30, 50, 90]);
  });

  it("projects month-end spending based on daily average", async () => {
    m.budget.mockResolvedValue({
      monthlyBudget: 1000,
      budgetAlertThreshold: 0.8,
      budgetCycleStartDay: 1,
    });
    m.summary.mockResolvedValue({ total: 100, transactionCount: 4 });

    const insights = await computeBudgetInsights(1);

    expect(insights.projectedMonthEnd).toBeGreaterThanOrEqual(insights.spent);
    expect(insights.dailyAverage).toBeGreaterThan(0);
    expect(insights.recommendedDailyBudget).toBeGreaterThanOrEqual(0);
  });
});
