import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import {
  MapPin, Barcode, ShoppingCart, Users, TrendingDown, Trophy,
  ChefHat, Package, Plus, ArrowRight, Bell, Settings, LogOut,
  Store, Search, List, Sparkles
} from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth({
    redirectOnUnauthenticated: true,
  });

  const { data: stats } = trpc.user.getStats.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: lists } = trpc.lists.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: restockSuggestions } = trpc.pantry.getRestockSuggestions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const quickActions = [
    { icon: List, label: "Nueva lista", href: "/lists", color: "bg-blue-500" },
    { icon: Barcode, label: "Escanear precio", href: "/scanner", color: "bg-green-500" },
    { icon: TrendingDown, label: "Optimizar", href: "/optimize", color: "bg-purple-500" },
    { icon: MapPin, label: "Tiendas cerca", href: "/map", color: "bg-orange-500" },
  ];

  const navItems = [
    { icon: Store, label: "Tiendas", href: "/stores" },
    { icon: Search, label: "Productos", href: "/products" },
    { icon: List, label: "Mis listas", href: "/lists" },
    { icon: Package, label: "Despensa", href: "/pantry" },
    { icon: ChefHat, label: "Recetas", href: "/recipes" },
    { icon: Bell, label: "Alertas de precio", href: "/alerts" },
    { icon: Trophy, label: "Tabla de líderes", href: "/leaderboard" },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold">Grocery Waze</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/alerts">
              <Button variant="ghost" size="icon">
                <Bell className="w-5 h-5" />
              </Button>
            </Link>
            <Link href="/profile">
              <Button variant="ghost" size="icon">
                <Settings className="w-5 h-5" />
              </Button>
            </Link>
            <Button variant="ghost" size="icon" onClick={() => logout()}>
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Hola, {user?.name || "comprador"}</h1>
          <p className="text-muted-foreground">Lista la próxima compra y empezá a ahorrar.</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {quickActions.map((action) => (
            <Link key={action.label} href={action.href}>
              <Card className="cursor-pointer hover:shadow-md transition-all hover:-translate-y-1">
                <CardContent className="flex flex-col items-center justify-center p-6">
                  <div className={`w-12 h-12 rounded-full ${action.color} flex items-center justify-center mb-3`}>
                    <action.icon className="w-6 h-6 text-white" />
                  </div>
                  <span className="font-medium">{action.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-primary">{stats?.trustScore ?? 10}</div>
                  <div className="text-sm text-muted-foreground">Confianza</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-primary">{stats?.totalPoints ?? 0}</div>
                  <div className="text-sm text-muted-foreground">Puntos</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-primary">{stats?.priceReportsCount ?? 0}</div>
                  <div className="text-sm text-muted-foreground">Reportes</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-primary">#{stats?.weeklyRank ?? "-"}</div>
                  <div className="text-sm text-muted-foreground">Ranking semanal</div>
                </CardContent>
              </Card>
            </div>

            {/* Shopping Lists */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Mis listas</CardTitle>
                  <CardDescription>Organizá tus compras y compartilas</CardDescription>
                </div>
                <Link href="/lists">
                  <Button size="sm" className="gap-1">
                    <Plus className="w-4 h-4" /> Nueva lista
                  </Button>
                </Link>
              </CardHeader>
              <CardContent>
                {lists && lists.length > 0 ? (
                  <div className="space-y-3">
                    {lists.slice(0, 3).map((list) => (
                      <Link key={list.id} href={`/lists/${list.id}`}>
                        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer">
                          <div className="flex items-center gap-3">
                            <List className="w-5 h-5 text-primary" />
                            <div>
                              <div className="font-medium">{list.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {list.isShared && <Users className="w-3 h-3 inline mr-1" />}
                                {list.isShared ? "Compartida" : "Personal"}
                              </div>
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <List className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Aún no tenés listas</p>
                    <Link href="/lists">
                      <Button variant="link">Creá tu primera lista</Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Restock Suggestions */}
            {restockSuggestions && restockSuggestions.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-accent" />
                    Sugerencias de reposición
                  </CardTitle>
                  <CardDescription>Productos que podrías necesitar pronto</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {restockSuggestions.slice(0, 5).map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/10">
                        <div>
                          <div className="font-medium">{item.productName || item.customName}</div>
                          <div className="text-sm text-muted-foreground">
                            Última compra hace {item.daysSinceLastPurchase} días
                          </div>
                        </div>
                        <Button size="sm" variant="outline">Agregar a lista</Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Navigation */}
            <Card>
              <CardHeader>
                <CardTitle>Accesos rápidos</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <nav className="space-y-1">
                  {navItems.map((item) => (
                    <Link key={item.label} href={item.href}>
                      <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted cursor-pointer">
                        <item.icon className="w-5 h-5 text-muted-foreground" />
                        <span>{item.label}</span>
                      </div>
                    </Link>
                  ))}
                </nav>
              </CardContent>
            </Card>

            {/* Achievements Preview */}
            {stats?.achievements && stats.achievements.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-accent" />
                    Logros recientes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {stats.achievements.slice(0, 3).map((achievement) => (
                      <div key={achievement.achievementId} className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                          🏆
                        </div>
                        <div>
                          <div className="font-medium text-sm">{achievement.name}</div>
                          <div className="text-xs text-muted-foreground">{achievement.description}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
