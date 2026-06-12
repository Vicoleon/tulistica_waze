import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  Wallet, TrendingUp, AlertTriangle, Settings,
  Store, Tag, Calendar, CheckCircle2, PiggyBank, Trash2
} from "lucide-react";
import { toast } from "sonner";

const STATUS_COPY: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  on_track: { label: "Vas bien", color: "bg-sage-soft text-secondary-foreground", icon: CheckCircle2 },
  approaching_limit: { label: "Ojo al gasto", color: "bg-gold-soft text-gold", icon: AlertTriangle },
  over_budget: { label: "Sobre el presupuesto", color: "bg-rose-soft text-rose-foreground", icon: AlertTriangle },
  no_budget: { label: "Sin presupuesto", color: "bg-muted text-muted-foreground", icon: PiggyBank },
};

export default function Budget() {
  const { isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const [showSettings, setShowSettings] = useState(false);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [alertThreshold, setAlertThreshold] = useState([80]);
  const [cycleStartDay, setCycleStartDay] = useState("1");

  const { data: insights, isLoading } = trpc.budget.getInsights.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  useEffect(() => {
    if (insights?.settings) {
      setBudgetAmount(String(insights.settings.monthlyBudget));
      setAlertThreshold([Math.round(insights.settings.budgetAlertThreshold * 100)]);
      setCycleStartDay(String(insights.settings.budgetCycleStartDay));
    }
  }, [insights?.settings]);

  const setBudget = trpc.budget.setBudget.useMutation({
    onSuccess: () => {
      utils.budget.getInsights.invalidate();
      setShowSettings(false);
      toast.success("Presupuesto guardado");
    },
    onError: (err) => toast.error(err.message),
  });

  const clearBudget = trpc.budget.clearBudget.useMutation({
    onSuccess: () => {
      utils.budget.getInsights.invalidate();
      setShowSettings(false);
      toast.success("Presupuesto eliminado");
    },
  });

  const handleSave = () => {
    const amount = parseFloat(budgetAmount);
    if (!amount || amount <= 0) {
      toast.error("Poné un monto mayor a cero");
      return;
    }
    const day = parseInt(cycleStartDay);
    setBudget.mutate({
      monthlyBudget: amount,
      budgetAlertThreshold: alertThreshold[0] / 100,
      budgetCycleStartDay: isNaN(day) ? 1 : Math.min(28, Math.max(1, day)),
    });
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Wallet className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h2 className="text-xl font-bold mb-2">Iniciá sesión</h2>
            <p className="text-muted-foreground">
              Iniciá sesión para llevar el control de tu presupuesto del súper.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = insights?.status ?? "no_budget";
  const statusMeta = STATUS_COPY[status];
  const StatusIcon = statusMeta.icon;
  const progressPct = insights ? Math.min(100, Math.round(insights.pctUsed * 100)) : 0;

  return (
    <div className="min-h-screen bg-background">
      <main className="container py-6 sm:py-8 space-y-6">
        {/* Page heading */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="page-eyebrow">Tu semana</p>
            <h1 className="font-serif text-3xl sm:text-4xl text-foreground">
              Presupuesto
            </h1>
            <p className="text-muted-foreground max-w-2xl">
              Cuánto llevás gastado en el súper este ciclo y cuánto te queda.
            </p>
          </div>
          <Dialog open={showSettings} onOpenChange={setShowSettings}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="gap-1 rounded-full min-h-11 self-start sm:self-auto shrink-0"
              >
                <Settings className="w-4 h-4" />
                {insights?.settings ? "Editar presupuesto" : "Definir presupuesto"}
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl">Ajustes del presupuesto</DialogTitle>
              </DialogHeader>
              <div className="space-y-5 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="budget-amount">Presupuesto mensual (₡)</Label>
                  <Input
                    id="budget-amount"
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="ej. 150000"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Umbral de aviso</Label>
                    <span className="text-sm text-muted-foreground">{alertThreshold[0]}%</span>
                  </div>
                  <Slider
                    value={alertThreshold}
                    onValueChange={setAlertThreshold}
                    min={50}
                    max={100}
                    step={5}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cycle-start">Día del mes en que empieza el ciclo</Label>
                  <Input
                    id="cycle-start"
                    type="number"
                    min="1"
                    max="28"
                    value={cycleStartDay}
                    onChange={(e) => setCycleStartDay(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={handleSave}
                    disabled={setBudget.isPending}
                  >
                    {setBudget.isPending ? "Guardando…" : "Guardar presupuesto"}
                  </Button>
                  {insights?.settings && (
                    <Button
                      variant="outline"
                      onClick={() => clearBudget.mutate()}
                      disabled={clearBudget.isPending}
                      aria-label="Quitar presupuesto"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </header>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !insights ? null : !insights.settings ? (
          <Card>
            <CardContent className="p-10 text-center">
              <PiggyBank className="w-16 h-16 mx-auto mb-4 text-primary opacity-70" />
              <h2 className="text-xl font-bold mb-2">Todavía no tenés presupuesto</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Definí un presupuesto mensual para el súper y mirá tendencias de gasto,
                desglose por categoría y proyecciones para el resto del ciclo.
              </p>
              <Button onClick={() => setShowSettings(true)} className="gap-1">
                <Wallet className="w-4 h-4" /> Definir mi presupuesto
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-primary" /> Este ciclo
                    </CardTitle>
                    <CardDescription>
                      Día {insights.daysIntoCycle} de {insights.daysIntoCycle + insights.daysRemainingInCycle}
                    </CardDescription>
                  </div>
                  <Badge className={`${statusMeta.color} gap-1`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusMeta.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">
                      ₡{insights.spent.toFixed(2)} de ₡{insights.settings.monthlyBudget.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">{progressPct}%</span>
                  </div>
                  <Progress value={progressPct} className="h-2" />
                </div>
                <p className="text-sm text-muted-foreground">{insights.topInsight}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  <Stat label="Disponible" value={`₡${insights.remaining.toFixed(2)}`} />
                  <Stat
                    label="Proyectado"
                    value={`₡${insights.projectedMonthEnd.toFixed(2)}`}
                    hint={insights.projectedMonthEnd > insights.settings.monthlyBudget ? "se pasa" : undefined}
                  />
                  <Stat label="Promedio diario" value={`₡${insights.dailyAverage.toFixed(2)}`} />
                  <Stat
                    label="Sugerido por día"
                    value={`₡${insights.recommendedDailyBudget.toFixed(2)}`}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Tag className="w-4 h-4" /> Gasto por categoría
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {insights.byCategory.length === 0 ? (
                    <EmptyHint text="Registrá compras para ver el desglose por categoría." />
                  ) : (
                    <div className="space-y-3">
                      {insights.byCategory.slice(0, 6).map((c) => (
                        <div key={c.category ?? "uncategorized"}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium">{c.category ?? "Sin categoría"}</span>
                            <span className="text-muted-foreground">
                              ₡{c.spent.toFixed(2)} · {c.itemCount}{" "}
                              {c.itemCount === 1 ? "producto" : "productos"}
                            </span>
                          </div>
                          <Progress value={Math.round(c.pctOfTotal * 100)} className="h-1.5" />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Store className="w-4 h-4" /> Gasto por tienda
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {insights.byStore.length === 0 ? (
                    <EmptyHint text="Registrá compras con tienda para ver este gráfico." />
                  ) : (
                    <div className="space-y-3">
                      {insights.byStore.slice(0, 6).map((s) => (
                        <div key={s.storeId ?? "unknown"}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium">{s.storeName ?? "Tienda desconocida"}</span>
                            <span className="text-muted-foreground">
                              ₡{s.spent.toFixed(2)} · {s.visitCount}{" "}
                              {s.visitCount === 1 ? "visita" : "visitas"}
                            </span>
                          </div>
                          <Progress value={Math.round(s.pctOfTotal * 100)} className="h-1.5" />
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Calendar className="w-4 h-4" /> Tendencia de gasto diario
                </CardTitle>
                <CardDescription>Gasto acumulado en este ciclo</CardDescription>
              </CardHeader>
              <CardContent>
                {insights.trend.length === 0 ? (
                  <EmptyHint text="La tendencia aparece apenas registrés compras en este ciclo." />
                ) : (
                  <DailyTrendChart
                    trend={insights.trend}
                    budget={insights.settings.monthlyBudget}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 flex items-center gap-3">
                <TrendingUp className="w-5 h-5 text-primary" />
                <div className="text-sm">
                  <span className="font-medium">{insights.transactionCount}</span>{" "}
                  {insights.transactionCount === 1 ? "compra registrada" : "compras registradas"}{" "}
                  este ciclo. Registrá compras desde la despensa para mantener esto al día.
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}

interface StatProps {
  label: string;
  value: string;
  hint?: string;
}

function Stat({ label, value, hint }: StatProps) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
      {hint && <div className="text-xs text-rose-foreground">{hint}</div>}
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground py-4 text-center">{text}</p>;
}

interface TrendPoint {
  day: string;
  spent: number;
  cumulative: number;
}

function DailyTrendChart({ trend, budget }: { trend: TrendPoint[]; budget: number }) {
  const max = Math.max(budget, ...trend.map((p) => p.cumulative)) || 1;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-7 md:grid-cols-14 gap-1 items-end h-32">
        {trend.slice(-14).map((point) => {
          const pct = (point.cumulative / max) * 100;
          const overBudget = point.cumulative > budget;
          return (
            <div key={point.day} className="flex flex-col items-center gap-1">
              <div
                className={`w-full rounded-t ${overBudget ? "bg-rose-foreground" : "bg-primary"}`}
                style={{ height: `${Math.max(2, pct)}%` }}
                title={`${point.day}: ₡${point.cumulative.toFixed(2)} acumulado`}
              />
              <span className="text-[10px] text-muted-foreground">
                {point.day.slice(5)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-primary" /> Dentro del presupuesto
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-rose-foreground" /> Sobre el presupuesto
        </span>
      </div>
    </div>
  );
}
