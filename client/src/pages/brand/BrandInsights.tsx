import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowLeft,
  Eye,
  Loader2,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { BrandShell } from "./BrandShell";

const TIER_LABELS: Record<string, string> = {
  value: "Value",
  mid: "Mid",
  premium: "Premium",
  unknown: "Sin perfil",
};

const HOUSEHOLD_LABELS: Record<string, string> = {
  "1": "1 persona",
  "2": "2 personas",
  "3-4": "3-4 personas",
  "5+": "5+ personas",
  unknown: "Sin perfil",
};

const CADENCE_LABELS: Record<string, string> = {
  weekly: "Cada semana",
  biweekly: "Cada quince días",
  monthly: "Una vez al mes",
  frequent: "Varias veces / semana",
  unknown: "Sin perfil",
};

const CHAIN_LABELS: Record<string, string> = {
  walmart: "Walmart",
  maxipali: "MaxiPalí",
  pali: "Palí",
  automercado: "Auto Mercado",
  pricesmart: "PriceSmart",
  masxmenos: "Más x Menos",
  megasuper: "Megasuper",
  ferias: "Ferias del agricultor",
  pulperia: "Pulpería del barrio",
  otra: "Otra",
};

export default function BrandInsights() {
  const [, navigate] = useLocation();
  const { data: brand, isLoading: brandLoading } = trpc.brand.me.useQuery();
  useEffect(() => {
    if (!brandLoading && !brand) navigate("/brand/login");
  }, [brand, brandLoading, navigate]);

  const { data, isLoading } = trpc.brandInsights.summary.useQuery(undefined, {
    enabled: !!brand,
    refetchInterval: 60_000,
  });

  if (brandLoading || isLoading) {
    return (
      <BrandShell>
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      </BrandShell>
    );
  }
  if (!brand) return null;

  // No campaigns yet — friendly empty state with a CTA.
  if (!data || data.campaignIds.length === 0) {
    return (
      <BrandShell>
        <Header />
        <Card className="rounded-3xl border bg-card shadow-paper p-12 text-center mt-6">
          <Sparkles className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
          <h2 className="font-serif text-2xl mb-2">
            Tus insights llegan con tu primera campaña.
          </h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            En cuanto lances un placement, este panel se llena con la
            audiencia real que estás alcanzando.
          </p>
          <button
            onClick={() => navigate("/brand/campaigns/new")}
            className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-6 py-2.5 font-medium hover:bg-primary/90"
          >
            Crear mi primera campaña
          </button>
        </Card>
      </BrandShell>
    );
  }

  return (
    <BrandShell>
      <Header />

      {/* Top: reach + sparkline */}
      <div className="grid lg:grid-cols-[1fr_2fr] gap-4 mb-6">
        <ReachCard reach={data.reach} windowDays={data.windowDays} />
        <TrendCard trend={data.dailyTrend} />
      </div>

      {/* Audience composition */}
      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <BreakdownCard
          icon={<Users className="w-4 h-4" />}
          title="Por tier"
          rows={data.audienceByTier}
          labelMap={TIER_LABELS}
        />
        <BreakdownCard
          icon={<Users className="w-4 h-4" />}
          title="Por hogar"
          rows={data.audienceByHousehold}
          labelMap={HOUSEHOLD_LABELS}
        />
        <BreakdownCard
          icon={<Users className="w-4 h-4" />}
          title="Por cadencia"
          rows={data.audienceByCadence}
          labelMap={CADENCE_LABELS}
        />
      </div>

      {/* Tier gap + chain affinity */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <TierGapCard tierGap={data.tierGap} />
        <ChainAffinityCard rows={data.chainAffinity} />
      </div>

      {/* Top queries */}
      <TopQueriesCard rows={data.topQueries} />
    </BrandShell>
  );
}

function Header() {
  const [, navigate] = useLocation();
  return (
    <header className="mb-6">
      <button
        type="button"
        onClick={() => navigate("/brand")}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Volver al dashboard
      </button>
      <h1 className="font-serif text-3xl sm:text-4xl tracking-tight">
        Insights
      </h1>
      <p className="text-muted-foreground mt-1 max-w-2xl">
        La audiencia que estás alcanzando, las búsquedas que importan en tu
        segmento, y la brecha entre quién te ve y quién no.
      </p>
    </header>
  );
}

function ReachCard({
  reach,
  windowDays,
}: {
  reach: number;
  windowDays: number;
}) {
  return (
    <Card className="rounded-3xl border bg-card shadow-paper p-6">
      <div className="flex items-center gap-3 mb-3">
        <span className="inline-flex w-9 h-9 rounded-full bg-primary/15 text-primary items-center justify-center">
          <Eye className="w-5 h-5" />
        </span>
        <div>
          <p className="text-sm text-muted-foreground">Alcance único</p>
          <p className="text-[11px] font-mono uppercase tracking-[0.12em] text-muted-foreground/70">
            últimos {windowDays} días
          </p>
        </div>
      </div>
      <p className="font-serif text-4xl font-semibold tracking-tight">
        {reach.toLocaleString("es-CR")}
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        hogares vieron al menos un placement tuyo
      </p>
    </Card>
  );
}

function TrendCard({
  trend,
}: {
  trend: Array<{ day: string; impressions: number; clicks: number }>;
}) {
  const stats = useMemo(() => {
    const totals = trend.reduce(
      (acc, d) => ({
        imp: acc.imp + d.impressions,
        clk: acc.clk + d.clicks,
      }),
      { imp: 0, clk: 0 }
    );
    return totals;
  }, [trend]);

  return (
    <Card className="rounded-3xl border bg-card shadow-paper p-6">
      <div className="flex items-baseline justify-between mb-3 gap-3 flex-wrap">
        <h2 className="font-serif text-lg">Tendencia · 30 días</h2>
        <div className="flex gap-4 text-xs font-mono text-muted-foreground">
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-primary mr-1.5" />
            Impresiones <b className="text-foreground">{stats.imp}</b>
          </span>
          <span>
            <span className="inline-block w-2 h-2 rounded-full bg-secondary mr-1.5" />
            Clicks <b className="text-foreground">{stats.clk}</b>
          </span>
        </div>
      </div>
      <Sparkline trend={trend} />
    </Card>
  );
}

function Sparkline({
  trend,
}: {
  trend: Array<{ day: string; impressions: number; clicks: number }>;
}) {
  if (trend.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic py-6">
        Sin datos en esta ventana todavía.
      </p>
    );
  }

  const width = 600;
  const height = 100;
  const padding = 8;
  const maxImp = Math.max(...trend.map((d) => d.impressions), 1);

  const xStep = (width - padding * 2) / Math.max(trend.length - 1, 1);
  const yScale = (v: number) =>
    height - padding - (v / maxImp) * (height - padding * 2);

  const points = trend
    .map((d, i) => `${padding + i * xStep},${yScale(d.impressions)}`)
    .join(" ");

  const clickPoints = trend
    .map((d, i) => `${padding + i * xStep},${yScale(d.clicks)}`)
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      preserveAspectRatio="none"
      className="w-full h-24"
      role="img"
      aria-label="Tendencia de impresiones y clicks en 30 días"
    >
      <defs>
        <linearGradient id="impFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.62 0.14 38)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="oklch(0.62 0.14 38)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Impressions area */}
      <polygon
        points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`}
        fill="url(#impFill)"
      />
      <polyline
        points={points}
        fill="none"
        stroke="oklch(0.62 0.14 38)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Clicks line */}
      <polyline
        points={clickPoints}
        fill="none"
        stroke="oklch(0.66 0.09 130)"
        strokeWidth="1.5"
        strokeDasharray="4 3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BreakdownCard({
  icon,
  title,
  rows,
  labelMap,
}: {
  icon: React.ReactNode;
  title: string;
  rows: Array<{ bucket: string; users: number; impressions: number }>;
  labelMap: Record<string, string>;
}) {
  const total = rows.reduce((acc, r) => acc + r.impressions, 0);
  return (
    <Card className="rounded-3xl border bg-card shadow-paper p-5">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-semibold mb-3">
        {icon}
        <span>{title}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic py-3">
          Sin datos todavía.
        </p>
      ) : (
        <div className="space-y-2.5">
          {rows.slice(0, 5).map((r) => {
            const pct =
              total > 0 ? Math.round((r.impressions / total) * 100) : 0;
            return (
              <div key={r.bucket}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{labelMap[r.bucket] ?? r.bucket}</span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    {r.impressions} · {pct}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TierGapCard({
  tierGap,
}: {
  tierGap: Array<{ tier: string; reached: number; total: number; pctReached: number }>;
}) {
  return (
    <Card className="rounded-3xl border bg-card shadow-paper p-6">
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4 text-primary" />
        <h2 className="font-serif text-lg">Alcance vs. base total</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Cuánto de cada tier ya estás alcanzando, vs cuántos hay en Tulistica.
      </p>
      {tierGap.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Sin datos todavía.
        </p>
      ) : (
        <div className="space-y-3">
          {tierGap.map((t) => (
            <div key={t.tier}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">
                  {TIER_LABELS[t.tier] ?? t.tier}
                </span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {t.reached} de {t.total} · {t.pctReached}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden relative">
                <div
                  className={cn(
                    "h-full rounded-full",
                    t.pctReached >= 50
                      ? "bg-secondary"
                      : t.pctReached >= 20
                        ? "bg-accent"
                        : "bg-primary"
                  )}
                  style={{ width: `${Math.min(t.pctReached, 100)}%` }}
                />
              </div>
              {t.pctReached < 20 && t.total > 0 ? (
                <p className="text-[11px] text-muted-foreground italic mt-1">
                  Brecha grande — subí tu bid o ampliá targeting.
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function ChainAffinityCard({
  rows,
}: {
  rows: Array<{ chain: string; users: number }>;
}) {
  const total = rows.reduce((acc, r) => acc + r.users, 0);
  return (
    <Card className="rounded-3xl border bg-card shadow-paper p-6">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-4 h-4 text-primary" />
        <h2 className="font-serif text-lg">Cadenas que prefieren</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Las tiendas que tu audiencia ya elige — buena pista para conquistar
        usuarios que no están con vos.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Sin datos todavía.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.slice(0, 6).map((r) => {
            const pct = total > 0 ? Math.round((r.users / total) * 100) : 0;
            return (
              <div
                key={r.chain}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span>{CHAIN_LABELS[r.chain] ?? r.chain}</span>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {r.users} · {pct}%
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function TopQueriesCard({
  rows,
}: {
  rows: Array<{ query: string; count: number }>;
}) {
  return (
    <Card className="rounded-3xl border bg-card shadow-paper p-6">
      <div className="flex items-center gap-2 mb-1">
        <Search className="w-4 h-4 text-primary" />
        <h2 className="font-serif text-lg">Top búsquedas en tu segmento</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        Lo que las compradoras de tu tier están buscando. Usá esto para
        ajustar tu targeting de palabras clave o crear campañas nuevas.
      </p>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Sin búsquedas registradas en tu segmento todavía.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
          {rows.slice(0, 14).map((r, i) => (
            <div
              key={`${r.query}-${i}`}
              className="flex items-baseline justify-between border-b border-dashed border-border/60 py-2"
            >
              <span className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground tabular-nums w-5">
                  #{i + 1}
                </span>
                <span className="font-serif italic">{r.query}</span>
              </span>
              <span className="font-mono font-semibold tabular-nums text-sm">
                {r.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
