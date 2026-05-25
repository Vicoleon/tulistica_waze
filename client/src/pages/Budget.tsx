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
  ArrowLeft, Wallet, TrendingUp, AlertTriangle, Settings,
  Store, Tag, Calendar, CheckCircle2, PiggyBank, Trash2
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const STATUS_COPY: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  on_track: { label: "On Track", color: "bg-emerald-500", icon: CheckCircle2 },
  approaching_limit: { label: "Watch Spending", color: "bg-amber-500", icon: AlertTriangle },
  over_budget: { label: "Over Budget", color: "bg-rose-500", icon: AlertTriangle },
  no_budget: { label: "No Budget Set", color: "bg-slate-400", icon: PiggyBank },
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
      toast.success("Budget saved");
    },
    onError: (err) => toast.error(err.message),
  });

  const clearBudget = trpc.budget.clearBudget.useMutation({
    onSuccess: () => {
      utils.budget.getInsights.invalidate();
      setShowSettings(false);
      toast.success("Budget cleared");
    },
  });

  const handleSave = () => {
    const amount = parseFloat(budgetAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a budget amount greater than zero");
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
            <h2 className="text-xl font-bold mb-2">Sign In Required</h2>
            <p className="text-muted-foreground">Sign in to track your grocery budget.</p>
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
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" aria-label="Back">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Budget Tracker</h1>
          <div className="ml-auto">
            <Dialog open={showSettings} onOpenChange={setShowSettings}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <Settings className="w-4 h-4" />
                  {insights?.settings ? "Edit Budget" : "Set Budget"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Budget Settings</DialogTitle>
                </DialogHeader>
                <div className="space-y-5 pt-2">
                  <div className="space-y-2">
                    <Label htmlFor="budget-amount">Monthly budget (CRC or USD)</Label>
                    <Input
                      id="budget-amount"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      placeholder="e.g. 300"
                      value={budgetAmount}
                      onChange={(e) => setBudgetAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Alert threshold</Label>
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
                    <Label htmlFor="cycle-start">Cycle start day of month</Label>
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
                      {setBudget.isPending ? "Saving..." : "Save Budget"}
                    </Button>
                    {insights?.settings && (
                      <Button
                        variant="outline"
                        onClick={() => clearBudget.mutate()}
                        disabled={clearBudget.isPending}
                        aria-label="Remove budget"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : !insights ? null : !insights.settings ? (
          <Card>
            <CardContent className="p-10 text-center">
              <PiggyBank className="w-16 h-16 mx-auto mb-4 text-primary opacity-70" />
              <h2 className="text-xl font-bold mb-2">No Budget Set</h2>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Set a monthly grocery budget to see spending trends, category breakdowns,
                and projections for the rest of your cycle.
              </p>
              <Button onClick={() => setShowSettings(true)} className="gap-1">
                <Wallet className="w-4 h-4" /> Set Your Budget
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
                      <Wallet className="w-5 h-5 text-primary" /> This Cycle
                    </CardTitle>
                    <CardDescription>
                      Day {insights.daysIntoCycle} of {insights.daysIntoCycle + insights.daysRemainingInCycle}
                    </CardDescription>
                  </div>
                  <Badge className={`${statusMeta.color} text-white gap-1`}>
                    <StatusIcon className="w-3 h-3" />
                    {statusMeta.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">
                      ${insights.spent.toFixed(2)} of ${insights.settings.monthlyBudget.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground">{progressPct}%</span>
                  </div>
                  <Progress value={progressPct} className="h-2" />
                </div>
                <p className="text-sm text-muted-foreground">{insights.topInsight}</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                  <Stat label="Remaining" value={`$${insights.remaining.toFixed(2)}`} />
                  <Stat
                    label="Projected"
                    value={`$${insights.projectedMonthEnd.toFixed(2)}`}
                    hint={insights.projectedMonthEnd > insights.settings.monthlyBudget ? "over" : undefined}
                  />
                  <Stat label="Daily avg" value={`$${insights.dailyAverage.toFixed(2)}`} />
                  <Stat
                    label="Recommended/day"
                    value={`$${insights.recommendedDailyBudget.toFixed(2)}`}
                  />
                </div>
              </CardContent>
            </Card>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Tag className="w-4 h-4" /> Spending by Category
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {insights.byCategory.length === 0 ? (
                    <EmptyHint text="Record purchases to see category breakdowns." />
                  ) : (
                    <div className="space-y-3">
                      {insights.byCategory.slice(0, 6).map((c) => (
                        <div key={c.category ?? "uncategorized"}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium">{c.category ?? "Uncategorized"}</span>
                            <span className="text-muted-foreground">
                              ${c.spent.toFixed(2)} · {c.itemCount} item{c.itemCount === 1 ? "" : "s"}
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
                    <Store className="w-4 h-4" /> Spending by Store
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {insights.byStore.length === 0 ? (
                    <EmptyHint text="Record purchases with a store to see this chart." />
                  ) : (
                    <div className="space-y-3">
                      {insights.byStore.slice(0, 6).map((s) => (
                        <div key={s.storeId ?? "unknown"}>
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-medium">{s.storeName ?? "Unknown store"}</span>
                            <span className="text-muted-foreground">
                              ${s.spent.toFixed(2)} · {s.visitCount} visit{s.visitCount === 1 ? "" : "s"}
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
                  <Calendar className="w-4 h-4" /> Daily Spending Trend
                </CardTitle>
                <CardDescription>Cumulative spend across this cycle</CardDescription>
              </CardHeader>
              <CardContent>
                {insights.trend.length === 0 ? (
                  <EmptyHint text="Spending trend will appear once you record purchases this cycle." />
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
                  <span className="font-medium">{insights.transactionCount}</span> transaction
                  {insights.transactionCount === 1 ? "" : "s"} recorded this cycle.
                  Record purchases from the pantry page to keep this accurate.
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
      {hint && <div className="text-xs text-rose-500">{hint}</div>}
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
                className={`w-full rounded-t ${overBudget ? "bg-rose-400" : "bg-primary"}`}
                style={{ height: `${Math.max(2, pct)}%` }}
                title={`${point.day}: $${point.cumulative.toFixed(2)} cumulative`}
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
          <span className="w-3 h-3 rounded bg-primary" /> On budget
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-rose-400" /> Over budget
        </span>
      </div>
    </div>
  );
}
