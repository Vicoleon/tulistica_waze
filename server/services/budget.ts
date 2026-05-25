import {
  getUserBudget,
  getSpendingSinceCycleStart,
  getSpendingByCategory,
  getSpendingByStore,
  getDailySpendingTrend,
  type BudgetSettings,
} from "../db";

export type BudgetStatus = "no_budget" | "on_track" | "approaching_limit" | "over_budget";

export interface CategoryBreakdown {
  category: string | null;
  spent: number;
  itemCount: number;
  pctOfTotal: number;
}

export interface StoreBreakdown {
  storeId: number | null;
  storeName: string | null;
  spent: number;
  visitCount: number;
  pctOfTotal: number;
}

export interface DailyPoint {
  day: string;
  spent: number;
  cumulative: number;
}

export interface BudgetInsights {
  settings: BudgetSettings | null;
  status: BudgetStatus;
  spent: number;
  remaining: number;
  projectedMonthEnd: number;
  pctUsed: number;
  daysIntoCycle: number;
  daysRemainingInCycle: number;
  transactionCount: number;
  dailyAverage: number;
  recommendedDailyBudget: number;
  byCategory: CategoryBreakdown[];
  byStore: StoreBreakdown[];
  trend: DailyPoint[];
  topInsight: string;
}

function computeCycleBounds(cycleStartDay: number): {
  start: Date;
  end: Date;
  daysIntoCycle: number;
  daysRemainingInCycle: number;
} {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), cycleStartDay, 0, 0, 0, 0);
  if (start > now) start.setMonth(start.getMonth() - 1);
  const end = new Date(start.getFullYear(), start.getMonth() + 1, cycleStartDay, 0, 0, 0, 0);
  const dayMs = 1000 * 60 * 60 * 24;
  const daysIntoCycle = Math.max(1, Math.floor((now.getTime() - start.getTime()) / dayMs) + 1);
  const daysRemainingInCycle = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / dayMs));
  return { start, end, daysIntoCycle, daysRemainingInCycle };
}

function classifyStatus(
  settings: BudgetSettings | null,
  spent: number,
  projectedMonthEnd: number
): BudgetStatus {
  if (!settings) return "no_budget";
  const pct = spent / settings.monthlyBudget;
  const projectedPct = projectedMonthEnd / settings.monthlyBudget;
  if (pct >= 1) return "over_budget";
  if (pct >= settings.budgetAlertThreshold || projectedPct >= 1) return "approaching_limit";
  return "on_track";
}

function buildInsight(
  status: BudgetStatus,
  settings: BudgetSettings | null,
  spent: number,
  projectedMonthEnd: number,
  topCategory: CategoryBreakdown | null,
  topStore: StoreBreakdown | null
): string {
  if (!settings) {
    return "Set a monthly budget to unlock spending insights and projections.";
  }
  if (status === "over_budget") {
    const overage = spent - settings.monthlyBudget;
    return `You're $${overage.toFixed(2)} over your $${settings.monthlyBudget.toFixed(0)} budget this cycle.`;
  }
  if (status === "approaching_limit") {
    return `On pace to spend $${projectedMonthEnd.toFixed(2)} this cycle — close to your $${settings.monthlyBudget.toFixed(0)} cap.`;
  }
  if (topCategory && topCategory.spent > 0) {
    return `Your biggest category is ${topCategory.category ?? "Uncategorized"} at $${topCategory.spent.toFixed(2)}. ${topStore?.storeName ? `Most visits to ${topStore.storeName}.` : ""}`.trim();
  }
  return `Spending is healthy — $${spent.toFixed(2)} of $${settings.monthlyBudget.toFixed(0)} used so far.`;
}

export async function computeBudgetInsights(userId: number): Promise<BudgetInsights> {
  const settings = await getUserBudget(userId);
  const cycleStartDay = settings?.budgetCycleStartDay ?? 1;
  const cycle = computeCycleBounds(cycleStartDay);

  const [summary, categories, storesBreakdown, trendRaw] = await Promise.all([
    getSpendingSinceCycleStart(userId, cycleStartDay),
    getSpendingByCategory(userId, cycleStartDay),
    getSpendingByStore(userId, cycleStartDay),
    getDailySpendingTrend(userId, cycleStartDay),
  ]);

  const spent = summary.total;
  const dailyAverage = spent / cycle.daysIntoCycle;
  const projectedMonthEnd = dailyAverage * (cycle.daysIntoCycle + cycle.daysRemainingInCycle);
  const remaining = settings ? Math.max(0, settings.monthlyBudget - spent) : 0;
  const pctUsed = settings ? Math.min(2, spent / settings.monthlyBudget) : 0;
  const recommendedDailyBudget = settings && cycle.daysRemainingInCycle > 0
    ? Math.max(0, remaining / cycle.daysRemainingInCycle)
    : 0;

  const byCategory: CategoryBreakdown[] = categories.map((c) => ({
    category: c.category,
    spent: Number(c.spent),
    itemCount: Number(c.itemCount),
    pctOfTotal: spent > 0 ? Number(c.spent) / spent : 0,
  }));
  const byStore: StoreBreakdown[] = storesBreakdown.map((s) => ({
    storeId: s.storeId,
    storeName: s.storeName,
    spent: Number(s.spent),
    visitCount: Number(s.visitCount),
    pctOfTotal: spent > 0 ? Number(s.spent) / spent : 0,
  }));

  let cumulative = 0;
  const trend: DailyPoint[] = trendRaw.map((point) => {
    cumulative += Number(point.spent);
    return {
      day: point.day,
      spent: Number(Number(point.spent).toFixed(2)),
      cumulative: Number(cumulative.toFixed(2)),
    };
  });

  const status = classifyStatus(settings, spent, projectedMonthEnd);
  const topInsight = buildInsight(
    status,
    settings,
    spent,
    projectedMonthEnd,
    byCategory[0] ?? null,
    byStore[0] ?? null
  );

  return {
    settings,
    status,
    spent: Number(spent.toFixed(2)),
    remaining: Number(remaining.toFixed(2)),
    projectedMonthEnd: Number(projectedMonthEnd.toFixed(2)),
    pctUsed: Number(pctUsed.toFixed(3)),
    daysIntoCycle: cycle.daysIntoCycle,
    daysRemainingInCycle: cycle.daysRemainingInCycle,
    transactionCount: summary.transactionCount,
    dailyAverage: Number(dailyAverage.toFixed(2)),
    recommendedDailyBudget: Number(recommendedDailyBudget.toFixed(2)),
    byCategory,
    byStore,
    trend,
    topInsight,
  };
}
