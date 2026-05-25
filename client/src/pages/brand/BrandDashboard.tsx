import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  ArrowRight,
  CircleDollarSign,
  Eye,
  Loader2,
  MousePointerClick,
  Pause,
  Play,
  Plus,
} from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";
import { BrandShell } from "./BrandShell";

const SURFACE_LABELS: Record<string, string> = {
  dashboard_promo: "Promoción · Dashboard",
  sponsored_search: "Búsqueda patrocinada",
  recipe_sponsored: "Receta patrocinada",
  banner: "Banner",
  cart_suggestion: "Sugerencia · Carrito",
};

export default function BrandDashboard() {
  const [, navigate] = useLocation();
  const { data: brand, isLoading: brandLoading } = trpc.brand.me.useQuery();

  // Redirect to login if no brand session.
  useEffect(() => {
    if (!brandLoading && !brand) navigate("/brand/login");
  }, [brand, brandLoading, navigate]);

  const { data: campaigns, isLoading: campaignsLoading } =
    trpc.brandCampaigns.getAll.useQuery(undefined, { enabled: !!brand });

  const utils = trpc.useUtils();
  const setActive = trpc.brandCampaigns.setActive.useMutation({
    onSuccess: async (_, vars) => {
      await utils.brandCampaigns.getAll.invalidate();
      toast.success(vars.isActive ? "Campaña reactivada." : "Campaña pausada.");
    },
    onError: (err) => toast.error(err.message),
  });

  if (brandLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (!brand) return null;

  const totals = (campaigns ?? []).reduce(
    (acc, c) => ({
      impressions: acc.impressions + (c.impressions ?? 0),
      clicks: acc.clicks + (c.clicks ?? 0),
      spend: acc.spend + (c.estSpend ?? 0),
    }),
    { impressions: 0, clicks: 0, spend: 0 }
  );
  const overallCtr =
    totals.impressions > 0
      ? (totals.clicks / totals.impressions) * 100
      : 0;

  return (
    <BrandShell>
      <header className="flex items-baseline justify-between gap-3 flex-wrap mb-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
            {brand.slug}
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl tracking-tight">
            Buenos días,{" "}
            <span className="italic text-primary">{brand.name}</span>.
          </h1>
          <p className="text-muted-foreground mt-1">
            Mirá tus campañas activas y la performance de cada placement.
          </p>
        </div>
        <Link href="/brand/campaigns/new">
          <Button size="lg" className="rounded-full">
            <Plus className="w-4 h-4 mr-1.5" />
            Nueva campaña
          </Button>
        </Link>
      </header>

      {/* Top stats */}
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        <Stat
          icon={<Eye className="w-5 h-5" />}
          label="Impresiones"
          value={totals.impressions.toLocaleString("es-CR")}
        />
        <Stat
          icon={<MousePointerClick className="w-5 h-5" />}
          label="Clicks"
          value={totals.clicks.toLocaleString("es-CR")}
          sub={`${overallCtr.toFixed(2)}% CTR`}
        />
        <Stat
          icon={<CircleDollarSign className="w-5 h-5" />}
          label="Gasto acumulado"
          value={`₡ ${totals.spend.toLocaleString("es-CR")}`}
          sub="Estimado (clicks × CPC)"
        />
      </div>

      {/* Campaign list */}
      <Card className="rounded-3xl border bg-card shadow-paper p-6">
        <div className="flex items-baseline justify-between mb-5 flex-wrap gap-2">
          <h2 className="font-serif text-2xl">Tus campañas</h2>
          {campaigns?.length ? (
            <span className="font-mono text-xs text-muted-foreground tracking-[0.1em] uppercase">
              {campaigns.length}{" "}
              {campaigns.length === 1 ? "campaña" : "campañas"}
            </span>
          ) : null}
        </div>

        {campaignsLoading ? (
          <p className="text-muted-foreground italic">Cargando…</p>
        ) : !campaigns?.length ? (
          <div className="text-center py-12">
            <p className="font-serif text-xl text-muted-foreground mb-3">
              Todavía no tenés campañas.
            </p>
            <p className="text-sm text-muted-foreground/80 mb-6">
              Tu primer placement toma ~2 minutos.
            </p>
            <Link href="/brand/campaigns/new">
              <Button size="lg" className="rounded-full">
                <Plus className="w-4 h-4 mr-1.5" />
                Crear mi primera campaña
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-border bg-paper-deep/40 p-4 sm:p-5 hover:border-primary/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={cn(
                          "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-[0.1em] font-semibold",
                          c.isActive
                            ? "bg-secondary/40 text-secondary-foreground"
                            : "bg-muted text-muted-foreground"
                        )}
                      >
                        {c.isActive ? "Activa" : "Pausada"}
                      </span>
                      <span className="text-[11px] font-mono uppercase tracking-[0.1em] text-muted-foreground">
                        {SURFACE_LABELS[c.type] ?? c.type}
                      </span>
                    </div>
                    <h3 className="font-serif text-lg font-semibold leading-tight">
                      {c.title}
                    </h3>
                    {c.description ? (
                      <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                        {c.description}
                      </p>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setActive.mutate({
                        id: c.id,
                        isActive: !c.isActive,
                      })
                    }
                    disabled={setActive.isPending}
                    className="rounded-full shrink-0"
                  >
                    {c.isActive ? (
                      <>
                        <Pause className="w-4 h-4 mr-1.5" />
                        Pausar
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4 mr-1.5" />
                        Reanudar
                      </>
                    )}
                  </Button>
                </div>

                <div className="grid grid-cols-4 gap-3 mt-4 pt-3 border-t border-dashed border-border/60 text-sm">
                  <CampaignStat
                    label="CPC"
                    value={`₡ ${(c.bidCpc ?? 0).toFixed(0)}`}
                  />
                  <CampaignStat
                    label="Impresiones"
                    value={(c.impressions ?? 0).toLocaleString("es-CR")}
                  />
                  <CampaignStat
                    label="Clicks"
                    value={(c.clicks ?? 0).toLocaleString("es-CR")}
                  />
                  <CampaignStat label="CTR" value={`${c.ctr.toFixed(2)}%`} />
                </div>
                {c.dailyBudget && c.dailyBudget > 0 ? (
                  <DailyBudgetBar
                    spent={c.dailySpend ?? 0}
                    budget={c.dailyBudget}
                    lastDate={c.dailySpendDate}
                  />
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
    </BrandShell>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card className="rounded-2xl border bg-card shadow-paper p-5">
      <div className="flex items-center gap-3 mb-2">
        <span className="inline-flex w-9 h-9 rounded-full bg-primary/15 text-primary items-center justify-center">
          {icon}
        </span>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="font-serif text-2xl font-semibold tracking-tight">
        {value}
      </p>
      {sub ? (
        <p className="text-xs text-muted-foreground mt-1">{sub}</p>
      ) : null}
    </Card>
  );
}

function CampaignStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-mono uppercase tracking-[0.1em] text-muted-foreground/80">
        {label}
      </p>
      <p className="font-mono font-semibold tabular-nums">{value}</p>
    </div>
  );
}

/**
 * Daily spend progress bar. Resets visually when the dailySpendDate is older
 * than today (server resets the counter on next click; we just show 0/budget
 * pre-reset).
 */
function DailyBudgetBar({
  spent,
  budget,
  lastDate,
}: {
  spent: number;
  budget: number;
  lastDate: Date | string | null | undefined;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const lastDay =
    lastDate instanceof Date
      ? lastDate.toISOString().slice(0, 10)
      : typeof lastDate === "string"
        ? lastDate.slice(0, 10)
        : null;
  const effectiveSpent = lastDay === today ? spent : 0;
  const pct = Math.min(100, (effectiveSpent / budget) * 100);
  const exhausted = effectiveSpent >= budget;

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs font-mono text-muted-foreground mb-1">
        <span>Presupuesto de hoy</span>
        <span
          className={cn(
            "tabular-nums",
            exhausted && "text-destructive font-semibold"
          )}
        >
          ₡ {effectiveSpent.toLocaleString("es-CR")} / ₡{" "}
          {budget.toLocaleString("es-CR")}
          {exhausted ? " · pausada hasta mañana" : ""}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full",
            exhausted ? "bg-destructive" : "bg-primary"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
