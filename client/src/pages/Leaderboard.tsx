import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Trophy, Medal, Star, TrendingUp, Crown, Award } from "lucide-react";
import { Link } from "wouter";

export default function Leaderboard() {
  const { user, isAuthenticated } = useAuth();
  const [period, setPeriod] = useState<"weekly" | "monthly" | "alltime">("weekly");

  const { data: leaderboard, isLoading } = trpc.gamification.getLeaderboard.useQuery({
    period,
    limit: 50,
  });

  const { data: userStats } = trpc.user.getStats.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-6 h-6 text-yellow-500" />;
    if (rank === 2) return <Medal className="w-6 h-6 text-gray-400" />;
    if (rank === 3) return <Medal className="w-6 h-6 text-amber-600" />;
    return <span className="w-6 h-6 flex items-center justify-center font-bold text-muted-foreground">{rank}</span>;
  };

  const getRankClass = (rank: number) => {
    if (rank === 1) return "bg-gradient-to-r from-yellow-100 to-amber-100 border-yellow-300";
    if (rank === 2) return "bg-gradient-to-r from-gray-100 to-slate-100 border-gray-300";
    if (rank === 3) return "bg-gradient-to-r from-orange-100 to-amber-100 border-orange-300";
    return "";
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Tabla de líderes</h1>
        </div>
      </header>

      <main className="container py-6">
        {/* User Stats Card */}
        {isAuthenticated && userStats && (
          <Card className="mb-6 bg-gradient-to-r from-primary/10 to-accent/10">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                  <Trophy className="w-8 h-8 text-primary-foreground" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold">{user?.name || "Vos"}</h2>
                  <div className="flex items-center gap-4 mt-1">
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-500" />
                      <span className="font-medium">{userStats.totalPoints} puntos</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className="w-4 h-4 text-primary" />
                      <span>Confianza: {userStats.trustScore}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">
                    #{userStats.weeklyRank || "-"}
                  </div>
                  <div className="text-sm text-muted-foreground">Esta semana</div>
                </div>
              </div>

              {/* Achievements */}
              {userStats.achievements && userStats.achievements.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center gap-2 mb-2">
                    <Award className="w-4 h-4 text-accent" />
                    <span className="text-sm font-medium">Logros</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {userStats.achievements.map((achievement) => (
                      <Badge key={achievement.achievementId} variant="secondary">
                        {achievement.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Leaderboard Tabs */}
        <Tabs value={period} onValueChange={(v) => setPeriod(v as any)}>
          <TabsList className="grid w-full grid-cols-3 mb-6">
            <TabsTrigger value="weekly">Semana</TabsTrigger>
            <TabsTrigger value="monthly">Mes</TabsTrigger>
            <TabsTrigger value="alltime">Total</TabsTrigger>
          </TabsList>

          <TabsContent value={period}>
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
              </div>
            ) : leaderboard && leaderboard.length > 0 ? (
              <div className="space-y-2">
                {leaderboard.map((entry, index) => {
                  const rank = index + 1;
                  const isCurrentUser = user?.id === entry.userId;
                  return (
                    <Card
                      key={entry.userId}
                      className={`${getRankClass(rank)} ${
                        isCurrentUser ? "ring-2 ring-primary" : ""
                      }`}
                    >
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="w-10 flex justify-center">
                          {getRankIcon(rank)}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold flex items-center gap-2">
                            {entry.userName || `Reportero #${entry.userId}`}
                            {isCurrentUser && (
                              <Badge variant="outline" className="text-xs">Vos</Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Confianza: {entry.trustScore}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-bold text-primary">
                            {(entry.points || 0).toLocaleString("es-CR")}
                          </div>
                          <div className="text-sm text-muted-foreground">puntos</div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <Trophy className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
                <h3 className="text-lg font-medium mb-2">Aún no hay ranking</h3>
                <p className="text-muted-foreground">
                  Reportá precios para ganar puntos y subir en la tabla.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* How to Earn Points */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">¿Cómo ganás puntos?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="font-bold text-primary">+10</span>
                </div>
                <div>
                  <div className="font-medium">Reportar precio</div>
                  <div className="text-muted-foreground">Subí un precio verificado</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="font-bold text-primary">+5</span>
                </div>
                <div>
                  <div className="font-medium">Verificar a otros</div>
                  <div className="text-muted-foreground">Confirmá el precio de otra persona</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <span className="font-bold text-primary">+25</span>
                </div>
                <div>
                  <div className="font-medium">Primer precio</div>
                  <div className="text-muted-foreground">Sé el primero en reportar un producto</div>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
                  <span className="font-bold text-accent-foreground">x2</span>
                </div>
                <div>
                  <div className="font-medium">Multiplicador de confianza</div>
                  <div className="text-muted-foreground">A más confianza, más puntos</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
