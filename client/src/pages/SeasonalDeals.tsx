import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Sparkles, TrendingDown, Hourglass, Minus, HelpCircle,
  Calendar, BarChart3
} from "lucide-react";
import { Link } from "wouter";

type Signal = "deal_window_now" | "wait_for_drop" | "stable" | "insufficient_data";

const SIGNAL_META: Record<Signal, {
  label: string;
  color: string;
  icon: typeof TrendingDown;
  order: number;
}> = {
  deal_window_now: { label: "Buy now", color: "bg-emerald-500", icon: TrendingDown, order: 0 },
  wait_for_drop: { label: "Wait", color: "bg-amber-500", icon: Hourglass, order: 1 },
  stable: { label: "Stable", color: "bg-slate-400", icon: Minus, order: 2 },
  insufficient_data: { label: "Not enough data", color: "bg-slate-300", icon: HelpCircle, order: 3 },
};

const FILTERS: { value: "all" | Signal; label: string }[] = [
  { value: "all", label: "All" },
  { value: "deal_window_now", label: "Buy now" },
  { value: "wait_for_drop", label: "Wait" },
  { value: "stable", label: "Stable" },
];

export default function SeasonalDeals() {
  const { isAuthenticated } = useAuth();
  const [filter, setFilter] = useState<"all" | Signal>("all");

  const { data: predictions, isLoading } = trpc.seasonal.getPredictions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Sparkles className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h2 className="text-xl font-bold mb-2">Sign In Required</h2>
            <p className="text-muted-foreground">Sign in to see seasonal deal predictions.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filtered = predictions?.filter((p) => filter === "all" || p.signal === filter) ?? [];

  const buyNowCount = predictions?.filter((p) => p.signal === "deal_window_now").length ?? 0;
  const waitCount = predictions?.filter((p) => p.signal === "wait_for_drop").length ?? 0;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" aria-label="Back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Seasonal Deals</h1>
            <p className="text-xs text-muted-foreground">
              Predicted best time to buy based on price history
            </p>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <SummaryCard
            label="Buy now"
            value={buyNowCount}
            color="text-emerald-600"
            icon={TrendingDown}
          />
          <SummaryCard
            label="Wait for drop"
            value={waitCount}
            color="text-amber-600"
            icon={Hourglass}
          />
          <SummaryCard
            label="Products tracked"
            value={predictions?.length ?? 0}
            color="text-primary"
            icon={BarChart3}
          />
        </div>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | Signal)}>
          <TabsList className="grid grid-cols-4 w-full max-w-md">
            {FILTERS.map((f) => (
              <TabsTrigger key={f.value} value={f.value}>
                {f.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <Sparkles className="w-12 h-12 mx-auto mb-3 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">
                {filter === "all" ? "No predictions yet" : "Nothing in this category"}
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {filter === "all"
                  ? "Predictions need at least 4 months of price history. Keep reporting prices to unlock this."
                  : "Try a different filter, or come back as more price history is collected."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {filtered.map((p) => (
              <PredictionCard key={p.productId} prediction={p} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: number;
  color: string;
  icon: typeof TrendingDown;
}

function SummaryCard({ label, value, color, icon: Icon }: SummaryCardProps) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <Icon className={`w-8 h-8 ${color}`} />
        <div>
          <div className="text-2xl font-bold">{value}</div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

interface Prediction {
  productId: number;
  productName: string;
  category: string | null;
  signal: Signal;
  currentPrice: number | null;
  yearlyAveragePrice: number;
  bestMonth: { month: number; name: string; avgPrice: number } | null;
  worstMonth: { month: number; name: string; avgPrice: number } | null;
  predictedDropPct: number;
  monthsUntilBest: number | null;
  monthlySeries: { month: number; name: string; avgPrice: number }[];
  rationale: string;
}

function PredictionCard({ prediction }: { prediction: Prediction }) {
  const meta = SIGNAL_META[prediction.signal];
  const SignalIcon = meta.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="text-base truncate">{prediction.productName}</CardTitle>
            {prediction.category && (
              <CardDescription className="text-xs">{prediction.category}</CardDescription>
            )}
          </div>
          <Badge className={`${meta.color} text-white gap-1 shrink-0`}>
            <SignalIcon className="w-3 h-3" />
            {meta.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{prediction.rationale}</p>

        {prediction.monthlySeries.length > 0 && (
          <MiniChart
            series={prediction.monthlySeries}
            bestMonth={prediction.bestMonth?.month ?? null}
            worstMonth={prediction.worstMonth?.month ?? null}
          />
        )}

        {prediction.signal !== "insufficient_data" && (
          <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t">
            <Stat
              label="Now"
              value={prediction.currentPrice !== null ? `$${prediction.currentPrice.toFixed(2)}` : "—"}
            />
            <Stat
              label="Best"
              value={prediction.bestMonth ? `$${prediction.bestMonth.avgPrice.toFixed(2)}` : "—"}
              hint={prediction.bestMonth?.name}
            />
            <Stat
              label="Avg"
              value={`$${prediction.yearlyAveragePrice.toFixed(2)}`}
            />
          </div>
        )}

        {prediction.signal === "wait_for_drop" && prediction.monthsUntilBest !== null && (
          <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-md px-3 py-2">
            <Calendar className="w-3.5 h-3.5" />
            Expected drop in {prediction.monthsUntilBest} month
            {prediction.monthsUntilBest === 1 ? "" : "s"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface MiniChartProps {
  series: { month: number; name: string; avgPrice: number }[];
  bestMonth: number | null;
  worstMonth: number | null;
}

function MiniChart({ series, bestMonth, worstMonth }: MiniChartProps) {
  const prices = series.map((s) => s.avgPrice);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const currentMonth = new Date().getMonth() + 1;

  return (
    <div className="grid grid-cols-12 gap-1 h-16 items-end">
      {Array.from({ length: 12 }, (_, i) => i + 1).map((monthNum) => {
        const point = series.find((s) => s.month === monthNum);
        const pct = point ? ((point.avgPrice - min) / range) * 100 : 0;
        const isBest = monthNum === bestMonth;
        const isWorst = monthNum === worstMonth;
        const isCurrent = monthNum === currentMonth;
        const bg = isBest
          ? "bg-emerald-500"
          : isWorst
            ? "bg-rose-400"
            : point
              ? "bg-slate-300 dark:bg-slate-600"
              : "bg-slate-100 dark:bg-slate-800";
        return (
          <div key={monthNum} className="flex flex-col items-center justify-end gap-1 h-full">
            <div
              className={`w-full rounded-t ${bg} ${isCurrent ? "ring-2 ring-primary ring-offset-1" : ""}`}
              style={{ height: point ? `${Math.max(8, 100 - pct)}%` : "8%" }}
              title={point ? `${point.name}: $${point.avgPrice.toFixed(2)}` : `${monthFromIndex(monthNum)}: no data`}
            />
          </div>
        );
      })}
    </div>
  );
}

function monthFromIndex(monthNum: number): string {
  return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][monthNum - 1];
}

interface StatProps {
  label: string;
  value: string;
  hint?: string;
}

function Stat({ label, value, hint }: StatProps) {
  return (
    <div>
      <div className="text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="font-semibold text-sm">{value}</div>
      {hint && <div className="text-muted-foreground text-[10px]">{hint}</div>}
    </div>
  );
}
