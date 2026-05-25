import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Trophy, Crown, Medal, Award } from "lucide-react";
import { Link } from "wouter";

type Period = "weekly" | "monthly" | "alltime";

const PODIUM_STYLES: Record<1 | 2 | 3, { tier: string; ring: string; icon: typeof Crown; chip: string; order: string; height: string }> = {
  1: {
    tier: "Oro",
    ring: "ring-butter shadow-paper-lg",
    icon: Crown,
    chip: "bg-butter text-butter-foreground",
    order: "order-2",
    height: "min-h-[230px]",
  },
  2: {
    tier: "Plata",
    ring: "ring-sky shadow-paper",
    icon: Medal,
    chip: "bg-sky text-sky-foreground",
    order: "order-1",
    height: "min-h-[200px]",
  },
  3: {
    tier: "Bronce",
    ring: "ring-accent shadow-paper",
    icon: Award,
    chip: "bg-accent text-accent-foreground",
    order: "order-3",
    height: "min-h-[200px]",
  },
};

const PERIODS: { key: Period; label: string }[] = [
  { key: "weekly", label: "Esta semana" },
  { key: "monthly", label: "Este mes" },
  { key: "alltime", label: "Histórico" },
];

export default function Leaderboard() {
  const { user, isAuthenticated } = useAuth();
  const [period, setPeriod] = useState<Period>("weekly");

  const { data: leaderboard, isLoading } = trpc.gamification.getLeaderboard.useQuery({
    period,
    limit: 50,
  });

  const { data: userStats } = trpc.user.getStats.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const top3 = useMemo(() => leaderboard?.slice(0, 3) ?? [], [leaderboard]);
  const rest = useMemo(() => leaderboard?.slice(3) ?? [], [leaderboard]);

  const currentRank = userStats?.weeklyRank ?? null;
  const pointsToNextBracket = useMemo(() => {
    if (!currentRank || !leaderboard) return null;
    const target = leaderboard[Math.max(0, currentRank - 2)];
    if (!target) return null;
    const myEntry = leaderboard.find((e) => e.userId === user?.id);
    if (!myEntry) return null;
    const diff = (target.points ?? 0) - (myEntry.points ?? 0) + 1;
    return diff > 0 ? diff : null;
  }, [currentRank, leaderboard, user?.id]);

  return (
    <div className="min-h-screen bg-background pb-32 lg:pb-12">
      <header className="border-b border-border/60 bg-card/80 backdrop-blur sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" aria-label="Volver al inicio">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex flex-col leading-tight">
            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Comunidad
            </span>
            <span className="font-serif text-lg text-foreground">Ranking</span>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-4xl">
        <section className="mb-8">
          <h1 className="font-serif text-3xl md:text-4xl text-foreground tracking-tight">
            Ranking de la semana
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Quienes ayudan a Costa Rica a comer más barato.
          </p>
        </section>

        {/* Period tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-8">
          {PERIODS.map((p) => {
            const active = period === p.key;
            return (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className={`shrink-0 inline-flex items-center gap-2 rounded-full h-11 px-5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-foreground text-background"
                    : "bg-card border border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : leaderboard && leaderboard.length > 0 ? (
          <>
            {/* Podium */}
            {top3.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10 items-end">
                {top3.map((entry, idx) => {
                  const rank = (idx + 1) as 1 | 2 | 3;
                  const cfg = PODIUM_STYLES[rank];
                  const Icon = cfg.icon;
                  const isMe = user?.id === entry.userId;
                  return (
                    <Card
                      key={entry.userId}
                      className={`rounded-3xl ring-2 ring-offset-2 ring-offset-background bg-card ${cfg.ring} ${cfg.order} ${cfg.height} flex flex-col`}
                    >
                      <CardContent className="p-6 text-center flex flex-col items-center justify-between flex-1">
                        <div>
                          <div
                            className={`inline-flex items-center justify-center w-14 h-14 rounded-full ${cfg.chip} mb-3`}
                          >
                            <Icon className="w-7 h-7" strokeWidth={1.8} />
                          </div>
                          <div className={`inline-flex items-center rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${cfg.chip} mb-3`}>
                            #{rank} · {cfg.tier}
                          </div>
                          <div className="font-serif text-xl leading-tight">
                            {entry.userName || `Vecino ${entry.userId}`}
                            {isMe && (
                              <span className="block text-xs font-sans text-primary mt-1 normal-case tracking-normal">
                                — sos vos
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="mt-4">
                          <div className="font-mono text-2xl text-foreground leading-none">
                            {(entry.points ?? 0).toLocaleString("es-CR")}
                          </div>
                          <div className="text-xs uppercase tracking-[0.14em] text-muted-foreground mt-1">
                            puntos
                          </div>
                          {typeof entry.priceReports === "number" && (
                            <div className="text-xs text-muted-foreground mt-2 font-mono">
                              {entry.priceReports} reportes
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Rest of the rankings */}
            {rest.length > 0 && (
              <Card className="rounded-3xl shadow-paper border-border/60 overflow-hidden">
                <CardContent className="p-0">
                  {rest.map((entry, idx) => {
                    const rank = idx + 4;
                    const isMe = user?.id === entry.userId;
                    const striped = idx % 2 === 1;
                    return (
                      <div
                        key={entry.userId}
                        className={`flex items-center gap-4 p-4 border-b border-dashed border-border last:border-0 ${
                          striped ? "bg-paper-deep/60" : "bg-card"
                        } ${isMe ? "ring-2 ring-primary ring-inset" : ""}`}
                      >
                        <div className="w-10 text-center">
                          <div className="font-mono text-base text-muted-foreground">
                            #{rank}
                          </div>
                        </div>
                        <div className="w-10 h-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-serif text-sm shrink-0">
                          {(entry.userName ?? "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-serif text-base truncate flex items-center gap-2">
                            {entry.userName || `Vecino ${entry.userId}`}
                            {isMe && (
                              <span className="text-[10px] uppercase tracking-[0.14em] text-primary font-sans">
                                sos vos
                              </span>
                            )}
                          </div>
                          {typeof entry.trustScore === "number" && (
                            <div className="text-xs text-muted-foreground">
                              Confianza{" "}
                              <span className="font-mono">{entry.trustScore}</span>
                            </div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-mono text-base">
                            {(entry.points ?? 0).toLocaleString("es-CR")}
                          </div>
                          <div className="text-xs text-muted-foreground">puntos</div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <Card className="rounded-3xl shadow-paper border-border/60">
            <CardContent className="text-center py-14 px-6">
              <Trophy className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
              <h3 className="font-serif text-2xl mb-2">El ranking arranca pronto.</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Escaneá un precio en tu próxima compra y entrá en la tabla esta semana.
              </p>
              <Link href="/scanner">
                <Button className="rounded-full h-11 px-5">Escanear un precio</Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Cómo ganar puntos */}
        <Card className="rounded-3xl border-border/60 mt-10 bg-sage-soft">
          <CardContent className="p-6 md:p-7">
            <div className="text-xs uppercase tracking-[0.16em] text-secondary-foreground/80 mb-1">
              Cómo se ganan los puntos
            </div>
            <h3 className="font-serif text-xl text-secondary-foreground mb-5">
              Pequeños aportes, ahorros enormes.
            </h3>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { p: "+10", t: "Reportar un precio", d: "Cada precio verificado vale 10." },
                { p: "+5", t: "Confirmar a otros", d: "Validás un reporte de un vecino." },
                { p: "+25", t: "Primer reporte", d: "Sos el primero en cargar un producto." },
                { p: "×2", t: "Confianza alta", d: "Más confianza, más puntos por reporte." },
              ].map((row) => (
                <div
                  key={row.t}
                  className="flex items-start gap-3 p-3 rounded-2xl bg-card border border-border/50"
                >
                  <div className="w-11 h-11 rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-mono text-sm shrink-0">
                    {row.p}
                  </div>
                  <div>
                    <div className="font-serif text-base">{row.t}</div>
                    <div className="text-xs text-muted-foreground">{row.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Your position — sticky on mobile, inline on desktop */}
      {isAuthenticated && userStats && (
        <div className="fixed inset-x-0 bottom-0 lg:hidden z-40 px-4 pb-4 pt-2 pointer-events-none">
          <div className="container px-0 pointer-events-auto">
            <div className="rounded-full bg-foreground text-background shadow-paper-lg px-5 py-3 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-background/15 flex items-center justify-center font-mono text-sm shrink-0">
                #{currentRank ?? "—"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-serif leading-tight">
                  Vos estás en el puesto #{currentRank ?? "—"}
                </div>
                <div className="text-[11px] text-background/70 truncate">
                  <span className="font-mono">{(userStats.totalPoints ?? 0).toLocaleString("es-CR")}</span> puntos
                  {pointsToNextBracket ? (
                    <>
                      {" · "}sumá{" "}
                      <span className="font-mono">{pointsToNextBracket.toLocaleString("es-CR")}</span>{" "}
                      más para subir
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
