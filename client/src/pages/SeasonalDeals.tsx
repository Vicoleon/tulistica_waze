import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  Sparkles, TrendingDown, Hourglass, Minus, HelpCircle,
  Calendar, BarChart3, BellRing
} from "lucide-react";
import { Link } from "wouter";

type Signal = "deal_window_now" | "wait_for_drop" | "stable" | "insufficient_data";

const SIGNAL_META: Record<Signal, {
  label: string;
  color: string;
  icon: typeof TrendingDown;
  order: number;
}> = {
  deal_window_now: { label: "Comprá ya", color: "bg-gold-soft text-gold", icon: TrendingDown, order: 0 },
  wait_for_drop: { label: "Esperá", color: "bg-butter-soft text-butter-foreground", icon: Hourglass, order: 1 },
  stable: { label: "Estable", color: "bg-muted text-muted-foreground", icon: Minus, order: 2 },
  insufficient_data: { label: "Faltan datos", color: "bg-muted text-muted-foreground", icon: HelpCircle, order: 3 },
};

const FILTERS: { value: "all" | Signal; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "deal_window_now", label: "Comprá ya" },
  { value: "wait_for_drop", label: "Esperá" },
  { value: "stable", label: "Estable" },
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
            <h2 className="text-xl font-bold mb-2">Iniciá sesión</h2>
            <p className="text-muted-foreground">
              Iniciá sesión para ver las predicciones de temporada.
            </p>
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
      <main className="container py-6 sm:py-8 space-y-6">
        {/* Page heading */}
        <header className="space-y-2">
          <p className="page-eyebrow">Seguir el precio</p>
          <h1 className="font-serif text-3xl sm:text-4xl text-foreground">
            Temporada
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            El mejor momento para comprar cada producto, según su historial de precios.
          </p>
        </header>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <SummaryCard
            label="Comprá ya"
            value={buyNowCount}
            color="text-gold"
            icon={TrendingDown}
          />
          <SummaryCard
            label="Esperá la baja"
            value={waitCount}
            color="text-butter-foreground"
            icon={Hourglass}
          />
          <SummaryCard
            label="Productos seguidos"
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
                {filter === "all" ? "Aún no hay predicciones" : "Nada en esta categoría"}
              </h3>
              <p className="text-muted-foreground max-w-md mx-auto">
                {filter === "all"
                  ? "Las predicciones necesitan al menos 4 meses de historial de precios. Seguí reportando precios para desbloquearlas."
                  : "Probá otro filtro, o volvé cuando haya más historial de precios."}
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
          <Badge className={`${meta.color} gap-1 shrink-0`}>
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
          <div className="grid grid-cols-3 gap-2 text-xs pt-2 border-t border-border">
            <Stat
              label="Hoy"
              value={prediction.currentPrice !== null ? `₡${prediction.currentPrice.toFixed(2)}` : "—"}
            />
            <Stat
              label="Mejor"
              value={prediction.bestMonth ? `₡${prediction.bestMonth.avgPrice.toFixed(2)}` : "—"}
              hint={prediction.bestMonth?.name}
            />
            <Stat
              label="Promedio"
              value={`₡${prediction.yearlyAveragePrice.toFixed(2)}`}
            />
          </div>
        )}

        {prediction.signal === "wait_for_drop" && prediction.monthsUntilBest !== null && (
          <div className="flex items-center gap-2 text-xs text-butter-foreground bg-butter-soft rounded-md px-3 py-2">
            <Calendar className="w-3.5 h-3.5" />
            Baja esperada en {prediction.monthsUntilBest}{" "}
            {prediction.monthsUntilBest === 1 ? "mes" : "meses"}
          </div>
        )}

        {/* Acción tranquila — seguir este precio con una alerta */}
        <div className="pt-1">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="h-10 gap-1.5 rounded-full px-3 text-xs text-muted-foreground hover:bg-gold-soft hover:text-gold"
          >
            <Link href="/alerts">
              <BellRing className="w-3.5 h-3.5" />
              Crear alerta
            </Link>
          </Button>
        </div>
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
          ? "bg-gold"
          : isWorst
            ? "bg-rose-foreground"
            : point
              ? "bg-muted-foreground/40"
              : "bg-muted";
        return (
          <div key={monthNum} className="flex flex-col items-center justify-end gap-1 h-full">
            <div
              className={`w-full rounded-t ${bg} ${isCurrent ? "ring-2 ring-primary ring-offset-1" : ""}`}
              style={{ height: point ? `${Math.max(8, 100 - pct)}%` : "8%" }}
              title={point ? `${point.name}: ₡${point.avgPrice.toFixed(2)}` : `${monthFromIndex(monthNum)}: sin datos`}
            />
          </div>
        );
      })}
    </div>
  );
}

function monthFromIndex(monthNum: number): string {
  return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Set", "Oct", "Nov", "Dic"][monthNum - 1];
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
