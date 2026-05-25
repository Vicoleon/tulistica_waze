import { useAuth } from "@/_core/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  Loader2,
  TrendingUp,
  Users,
} from "lucide-react";

const TIER_LABELS: Record<string, string> = {
  value: "Value",
  mid: "Mid",
  premium: "Premium",
  unknown: "Sin perfil",
};

const TIER_COLORS: Record<string, string> = {
  value: "bg-secondary text-secondary-foreground",
  mid: "bg-accent text-accent-foreground",
  premium: "bg-primary text-primary-foreground",
  unknown: "bg-muted text-muted-foreground",
};

const EVENT_LABELS: Record<string, string> = {
  onboarding_started: "Onboarding · iniciado",
  onboarding_skipped: "Onboarding · saltado",
  onboarding_completed: "Onboarding · completado",
  list_created: "Lista creada",
  list_item_added: "Item agregado a lista",
  list_optimized: "Lista optimizada",
  product_search: "Búsqueda de producto",
  product_clicked: "Click en producto",
  store_viewed: "Tienda vista",
  recipe_viewed: "Receta vista",
  recipe_imported: "Receta importada",
  recipe_added_to_list: "Receta → lista",
  price_reported: "Precio reportado",
  alert_created: "Alerta creada",
  alert_triggered: "Alerta disparada",
  scanner_used: "Escáner usado",
};

function labelFor(eventName: string): string {
  return EVENT_LABELS[eventName] ?? eventName;
}

export default function Admin() {
  const { user, loading } = useAuth();
  const { data, isLoading } = trpc.analytics.summary.useQuery(
    { days: 7 },
    { enabled: !loading && user?.role === "admin", refetchInterval: 30_000 }
  );
  const { data: campaigns, isLoading: campaignsLoading } =
    trpc.campaigns.adminSummary.useQuery(undefined, {
      enabled: !loading && user?.role === "admin",
      refetchInterval: 30_000,
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return (
      <div className="container py-12">
        <Card className="rounded-3xl border bg-card p-10 shadow-paper text-center">
          <AlertCircle className="w-10 h-10 mx-auto mb-4 text-muted-foreground" />
          <h1 className="font-serif text-2xl mb-2">Solo admins, por ahora.</h1>
          <p className="text-muted-foreground">
            Esta pantalla es para el equipo de Tulistica.
          </p>
        </Card>
      </div>
    );
  }

  const totalTierUsers =
    data?.byTier.reduce((sum, t) => sum + t.count, 0) ?? 0;

  return (
    <div className="container py-6 sm:py-8 space-y-8">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-serif italic">
          Admin · interno
        </p>
        <h1 className="font-serif text-3xl sm:text-4xl text-foreground">
          Analytics · últimos {data?.days ?? 7} días
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          La foto rápida de cómo se usa Tulistica esta semana. Se actualiza
          sola cada 30 segundos.
        </p>
      </header>

      {isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground py-12 justify-center">
          <Loader2 className="w-5 h-5 animate-spin" />
          Cargando…
        </div>
      ) : (
        <>
          {/* Big numbers */}
          <div className="grid sm:grid-cols-3 gap-4">
            <Stat
              icon={<Activity className="w-5 h-5" />}
              label="Eventos totales"
              value={data?.totalEvents ?? 0}
              accent="bg-primary/10 text-primary"
            />
            <Stat
              icon={<Users className="w-5 h-5" />}
              label="Usuarios con perfil"
              value={totalTierUsers}
              accent="bg-secondary/30 text-secondary-foreground"
            />
            <Stat
              icon={<TrendingUp className="w-5 h-5" />}
              label="Onboarding completados"
              value={data?.onboardingFunnel.completed ?? 0}
              accent="bg-accent/40 text-accent-foreground"
            />
          </div>

          {/* Funnel */}
          <Card className="rounded-3xl border bg-card p-6 shadow-paper">
            <h2 className="font-serif text-2xl mb-1">
              Onboarding funnel
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              ¿Cuánta gente cierra el flujo vs lo abandona?
            </p>
            <Funnel
              started={data?.onboardingFunnel.started ?? 0}
              completed={data?.onboardingFunnel.completed ?? 0}
              skipped={data?.onboardingFunnel.skipped ?? 0}
            />
          </Card>

          {/* Tier distribution */}
          <Card className="rounded-3xl border bg-card p-6 shadow-paper">
            <h2 className="font-serif text-2xl mb-1">Distribución por tier</h2>
            <p className="text-muted-foreground text-sm mb-6">
              El mix de la base. Más premium = bids más caros para marcas.
            </p>
            {data?.byTier.length ? (
              <div className="space-y-3">
                {data.byTier.map((row) => {
                  const pct = totalTierUsers
                    ? Math.round((row.count / totalTierUsers) * 100)
                    : 0;
                  return (
                    <div key={row.tier} className="space-y-1.5">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">
                          {TIER_LABELS[row.tier] ?? row.tier}
                        </span>
                        <span className="text-muted-foreground font-mono">
                          {row.count} · {pct}%
                        </span>
                      </div>
                      <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            TIER_COLORS[row.tier] ?? "bg-muted-foreground"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground italic">
                Todavía no hay perfiles completos.
              </p>
            )}
          </Card>

          {/* Events by type */}
          <Card className="rounded-3xl border bg-card p-6 shadow-paper">
            <h2 className="font-serif text-2xl mb-1">
              Eventos más frecuentes
            </h2>
            <p className="text-muted-foreground text-sm mb-6">
              Lo que la gente está haciendo en la app.
            </p>
            {data?.byEvent.length ? (
              <div className="grid sm:grid-cols-2 gap-x-8 gap-y-2.5">
                {data.byEvent.map((row) => (
                  <div
                    key={row.eventName}
                    className="flex justify-between items-baseline gap-3 border-b border-dashed border-border/60 py-2"
                  >
                    <span className="text-sm">{labelFor(row.eventName)}</span>
                    <span className="font-mono font-semibold text-foreground tabular-nums">
                      {row.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground italic">
                Aún no hay eventos esta ventana.
              </p>
            )}
          </Card>

          {/* Campaign performance (Fase 2) */}
          <Card className="rounded-3xl border bg-card p-6 shadow-paper">
            <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
              <h2 className="font-serif text-2xl">Campañas activas</h2>
              <span className="text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground">
                {campaigns?.length ?? 0} campañas
              </span>
            </div>
            <p className="text-muted-foreground text-sm mb-6">
              Performance de los placements patrocinados — impresiones,
              clics, CTR y gasto estimado.
            </p>
            {campaignsLoading ? (
              <p className="text-muted-foreground italic">Cargando…</p>
            ) : campaigns && campaigns.length > 0 ? (
              <div className="overflow-x-auto -mx-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-mono uppercase tracking-[0.12em] text-muted-foreground border-b border-border">
                      <th className="py-2 px-2 font-semibold">Sponsor</th>
                      <th className="py-2 px-2 font-semibold">Surface</th>
                      <th className="py-2 px-2 font-semibold text-right">CPC</th>
                      <th className="py-2 px-2 font-semibold text-right">Impresiones</th>
                      <th className="py-2 px-2 font-semibold text-right">Clicks</th>
                      <th className="py-2 px-2 font-semibold text-right">CTR</th>
                      <th className="py-2 px-2 font-semibold text-right">Gasto est.</th>
                      <th className="py-2 px-2 font-semibold text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map((c) => (
                      <tr
                        key={c.id}
                        className="border-b border-dashed border-border/60 hover:bg-paper-deep/40"
                      >
                        <td className="py-2.5 px-2">
                          <div className="font-medium text-foreground">
                            {c.sponsor ?? "—"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {c.title}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-muted-foreground font-mono text-xs">
                          {c.type}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          ₡ {(c.bidCpc ?? 0).toFixed(0)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {(c.impressions ?? 0).toLocaleString("es-CR")}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {(c.clicks ?? 0).toLocaleString("es-CR")}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          {c.ctr.toFixed(2)}%
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums">
                          ₡ {c.estSpend.toLocaleString("es-CR")}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <span
                            className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono uppercase tracking-[0.1em] font-semibold",
                              c.isActive
                                ? "bg-secondary/40 text-secondary-foreground"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {c.isActive ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-muted-foreground italic">
                No hay campañas todavía.
              </p>
            )}
          </Card>

          {/* Top queries */}
          <Card className="rounded-3xl border bg-card p-6 shadow-paper">
            <h2 className="font-serif text-2xl mb-1">Top búsquedas</h2>
            <p className="text-muted-foreground text-sm mb-6">
              Lo que la gente está buscando. Útil para targeting de marcas.
            </p>
            {data?.topQueries.length ? (
              <ol className="space-y-2">
                {data.topQueries.map((row, i) => (
                  <li
                    key={`${row.query}-${i}`}
                    className="flex justify-between items-baseline gap-3 border-b border-dashed border-border/60 py-2"
                  >
                    <span className="flex items-center gap-3">
                      <span className="font-mono text-xs text-muted-foreground tabular-nums w-5">
                        #{i + 1}
                      </span>
                      <span className="font-serif italic">{row.query}</span>
                    </span>
                    <span className="font-mono font-semibold tabular-nums">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-muted-foreground italic">
                Aún no hay búsquedas registradas.
              </p>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

interface StatProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
}

function Stat({ icon, label, value, accent }: StatProps) {
  return (
    <Card className="rounded-3xl border bg-card p-5 shadow-paper">
      <div className="flex items-center gap-3 mb-3">
        <span
          className={cn(
            "inline-flex w-9 h-9 items-center justify-center rounded-full",
            accent
          )}
        >
          {icon}
        </span>
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
      <p className="font-serif text-3xl font-semibold tracking-tight">
        {value.toLocaleString("es-CR")}
      </p>
    </Card>
  );
}

interface FunnelProps {
  started: number;
  completed: number;
  skipped: number;
}

function Funnel({ started, completed, skipped }: FunnelProps) {
  const completionRate = started > 0 ? (completed / started) * 100 : 0;
  const skipRate = started > 0 ? (skipped / started) * 100 : 0;
  return (
    <div className="space-y-3">
      <FunnelBar label="Iniciaron" count={started} percent={100} tone="primary" />
      <FunnelBar
        label="Completaron"
        count={completed}
        percent={completionRate}
        tone="secondary"
      />
      <FunnelBar
        label="Saltaron"
        count={skipped}
        percent={skipRate}
        tone="destructive"
      />
    </div>
  );
}

interface FunnelBarProps {
  label: string;
  count: number;
  percent: number;
  tone: "primary" | "secondary" | "destructive";
}

function FunnelBar({ label, count, percent, tone }: FunnelBarProps) {
  const toneClass = {
    primary: "bg-primary text-primary-foreground",
    secondary: "bg-secondary text-secondary-foreground",
    destructive: "bg-destructive/80 text-destructive-foreground",
  }[tone];
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground font-mono">
          {count} · {Math.round(percent)}%
        </span>
      </div>
      <div className="h-3 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", toneClass)}
          style={{ width: `${Math.max(percent, 2)}%` }}
        />
      </div>
    </div>
  );
}
