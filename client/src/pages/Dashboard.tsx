import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { getLoginUrl } from "@/const";
import {
  MapPin, Barcode, ShoppingCart, Users, TrendingDown, Trophy,
  ChefHat, Package, Plus, ArrowRight, Bell, Settings, LogOut,
  Store, Search, List, Sparkles, Wallet, Calendar
} from "lucide-react";
import { Link, useLocation } from "wouter";

export default function Dashboard() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();

  const { data: stats } = trpc.user.getStats.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: lists } = trpc.lists.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: restockSuggestions } = trpc.pantry.getRestockSuggestions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const loginUrl = getLoginUrl();
    if (loginUrl) {
      window.location.href = loginUrl;
      return null;
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-3">
            <ShoppingCart className="w-12 h-12 mx-auto text-primary" />
            <h2 className="text-xl font-bold">Sign-in unavailable</h2>
            <p className="text-sm text-muted-foreground">
              OAuth isn't configured in this environment. Set
              <code className="mx-1 px-1 rounded bg-muted">VITE_OAUTH_PORTAL_URL</code>
              and
              <code className="mx-1 px-1 rounded bg-muted">VITE_APP_ID</code>
              to enable login. Public pages still work.
            </p>
            <Link href="/">
              <Button variant="outline">Back to home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const quickActions = [
    { icon: List, label: "New List", href: "/lists", color: "bg-blue-500" },
    { icon: Barcode, label: "Scan Price", href: "/scanner", color: "bg-green-500" },
    { icon: TrendingDown, label: "Optimize", href: "/optimize", color: "bg-purple-500" },
    { icon: MapPin, label: "Find Stores", href: "/map", color: "bg-orange-500" },
  ];

  const navItems = [
    { icon: Store, label: "Stores", href: "/stores" },
    { icon: Search, label: "Products", href: "/products" },
    { icon: List, label: "My Lists", href: "/lists" },
    { icon: Package, label: "Pantry", href: "/pantry" },
    { icon: ChefHat, label: "Recipes", href: "/recipes" },
    { icon: Bell, label: "Price Alerts", href: "/alerts" },
    { icon: Wallet, label: "Budget", href: "/budget" },
    { icon: Calendar, label: "Seasonal Deals", href: "/seasonal" },
    { icon: Trophy, label: "Leaderboard", href: "/leaderboard" },
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
            <span className="text-xl font-bold">Tulistica</span>
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
          <h1 className="text-3xl font-bold mb-2">Welcome back, {user?.name || "Shopper"}!</h1>
          <p className="text-muted-foreground">Ready to save on your next grocery trip?</p>
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
                  <div className="text-2xl font-bold text-primary">{stats?.trustScore || 10}</div>
                  <div className="text-sm text-muted-foreground">Trust Score</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-primary">{stats?.totalPoints || 0}</div>
                  <div className="text-sm text-muted-foreground">Points</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-primary">{stats?.priceReportsCount || 0}</div>
                  <div className="text-sm text-muted-foreground">Reports</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="text-2xl font-bold text-primary">#{stats?.weeklyRank || "-"}</div>
                  <div className="text-sm text-muted-foreground">Weekly Rank</div>
                </CardContent>
              </Card>
            </div>

            {/* Shopping Lists */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>My Shopping Lists</CardTitle>
                  <CardDescription>Manage your shopping lists</CardDescription>
                </div>
                <Link href="/lists">
                  <Button size="sm" className="gap-1">
                    <Plus className="w-4 h-4" /> New List
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
                                {list.isShared ? "Shared" : "Personal"}
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
                    <p>No shopping lists yet</p>
                    <Link href="/lists">
                      <Button variant="link">Create your first list</Button>
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
                    Restock Suggestions
                  </CardTitle>
                  <CardDescription>Items you might need to buy soon</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {restockSuggestions.slice(0, 5).map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-3 rounded-lg bg-accent/10">
                        <div>
                          <div className="font-medium">{item.productName || item.customName}</div>
                          <div className="text-sm text-muted-foreground">
                            Last bought {item.daysSinceLastPurchase} days ago
                          </div>
                        </div>
                        <Button size="sm" variant="outline">Add to List</Button>
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
                <CardTitle>Quick Navigation</CardTitle>
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
                    Recent Achievements
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
