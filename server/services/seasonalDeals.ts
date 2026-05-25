import {
  getMonthlyAveragePrices,
  getCurrentLowestPrice,
  getTrackedProductsForUser,
  getPopularProductsForSeasonal,
} from "../db";

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

const MIN_MONTHS_OF_DATA = 4;
const MIN_DEAL_DROP_PCT = 0.07;

export type SeasonalSignal =
  | "deal_window_now"
  | "wait_for_drop"
  | "stable"
  | "insufficient_data";

export interface SeasonalPrediction {
  productId: number;
  productName: string;
  category: string | null;
  signal: SeasonalSignal;
  currentPrice: number | null;
  yearlyAveragePrice: number;
  bestMonth: { month: number; name: string; avgPrice: number } | null;
  worstMonth: { month: number; name: string; avgPrice: number } | null;
  predictedDropPct: number;
  monthsUntilBest: number | null;
  monthlySeries: { month: number; name: string; avgPrice: number }[];
  rationale: string;
}

function computePredictionFromSeries(
  productId: number,
  productName: string,
  category: string | null,
  series: { month: number; avgPrice: number }[],
  currentPrice: number | null
): SeasonalPrediction {
  const base: SeasonalPrediction = {
    productId,
    productName,
    category,
    signal: "insufficient_data",
    currentPrice,
    yearlyAveragePrice: 0,
    bestMonth: null,
    worstMonth: null,
    predictedDropPct: 0,
    monthsUntilBest: null,
    monthlySeries: series.map((s) => ({
      month: s.month,
      name: MONTH_NAMES[s.month - 1],
      avgPrice: Number(s.avgPrice.toFixed(2)),
    })),
    rationale: "Not enough price history yet — keep reporting prices to unlock predictions.",
  };

  if (series.length < MIN_MONTHS_OF_DATA) {
    return base;
  }

  const yearlyAvg = series.reduce((sum, s) => sum + s.avgPrice, 0) / series.length;
  const bestEntry = series.reduce((a, b) => (a.avgPrice <= b.avgPrice ? a : b));
  const worstEntry = series.reduce((a, b) => (a.avgPrice >= b.avgPrice ? a : b));

  const bestMonth = {
    month: bestEntry.month,
    name: MONTH_NAMES[bestEntry.month - 1],
    avgPrice: Number(bestEntry.avgPrice.toFixed(2)),
  };
  const worstMonth = {
    month: worstEntry.month,
    name: MONTH_NAMES[worstEntry.month - 1],
    avgPrice: Number(worstEntry.avgPrice.toFixed(2)),
  };

  const dropPct = worstEntry.avgPrice > 0
    ? (worstEntry.avgPrice - bestEntry.avgPrice) / worstEntry.avgPrice
    : 0;

  const currentMonth = new Date().getMonth() + 1;
  const monthsUntilBest = ((bestEntry.month - currentMonth) + 12) % 12;

  let signal: SeasonalSignal = "stable";
  let rationale = "Price has stayed within a tight range across the year — no clear seasonal pattern.";

  if (dropPct >= MIN_DEAL_DROP_PCT) {
    if (currentPrice !== null && currentPrice <= bestEntry.avgPrice * 1.05) {
      signal = "deal_window_now";
      rationale = `Currently at $${currentPrice.toFixed(2)} — near the yearly low of $${bestMonth.avgPrice} (${MONTH_NAMES[bestEntry.month - 1]}). Good time to buy.`;
    } else if (monthsUntilBest > 0 && monthsUntilBest <= 6) {
      signal = "wait_for_drop";
      const drop = Math.round(dropPct * 100);
      rationale = `Historically drops about ${drop}% by ${MONTH_NAMES[bestEntry.month - 1]} (in ${monthsUntilBest} month${monthsUntilBest > 1 ? "s" : ""}). Consider waiting if you can.`;
    } else {
      signal = "stable";
      rationale = `Seasonal low is ${MONTH_NAMES[bestEntry.month - 1]}, but it's far away. Buy when needed.`;
    }
  }

  return {
    ...base,
    signal,
    yearlyAveragePrice: Number(yearlyAvg.toFixed(2)),
    bestMonth,
    worstMonth,
    predictedDropPct: Number(dropPct.toFixed(3)),
    monthsUntilBest,
    rationale,
  };
}

export async function predictSeasonalDealsForUser(userId: number): Promise<SeasonalPrediction[]> {
  const tracked = await getTrackedProductsForUser(userId, 30);
  const trackedWithIds = tracked.filter(
    (p): p is typeof p & { productId: number } => p.productId !== null
  );
  if (trackedWithIds.length === 0) {
    const popular = await getPopularProductsForSeasonal(20);
    return Promise.all(
      popular.map((p) => predictForProduct(p.productId, p.productName, p.category ?? null))
    );
  }
  return Promise.all(
    trackedWithIds.map((p) => predictForProduct(p.productId, p.productName, p.category ?? null))
  );
}

export async function predictForProduct(
  productId: number,
  productName: string,
  category: string | null
): Promise<SeasonalPrediction> {
  const [rawSeries, currentPrice] = await Promise.all([
    getMonthlyAveragePrices(productId),
    getCurrentLowestPrice(productId),
  ]);
  const series = rawSeries.map((r) => ({
    month: Number(r.month),
    avgPrice: Number(r.avgPrice),
  }));
  return computePredictionFromSeries(productId, productName, category, series, currentPrice);
}

export function rankPredictions(predictions: SeasonalPrediction[]): SeasonalPrediction[] {
  const order: Record<SeasonalSignal, number> = {
    deal_window_now: 0,
    wait_for_drop: 1,
    stable: 2,
    insufficient_data: 3,
  };
  return [...predictions].sort((a, b) => {
    if (order[a.signal] !== order[b.signal]) return order[a.signal] - order[b.signal];
    return b.predictedDropPct - a.predictedDropPct;
  });
}
