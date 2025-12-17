import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import {
  MapPin, Barcode, ShoppingCart, Users, TrendingDown, Trophy,
  ChefHat, Package, Sparkles, ArrowRight, CheckCircle2
} from "lucide-react";
import { Link } from "wouter";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();

  const features = [
    {
      icon: MapPin,
      title: "Smart Store Finder",
      description: "Find nearby stores with real-time price comparisons using geospatial search"
    },
    {
      icon: TrendingDown,
      title: "Price Optimization",
      description: "Our Smart Cart algorithm finds the best shopping strategy - single store or split trips"
    },
    {
      icon: Barcode,
      title: "Barcode Scanner",
      description: "Scan products in-store to report prices and help the community"
    },
    {
      icon: Users,
      title: "Social Lists",
      description: "Share shopping lists with family and see real-time updates when items are checked off"
    },
    {
      icon: ChefHat,
      title: "Recipe Converter",
      description: "Paste a recipe URL and we'll extract ingredients directly to your shopping list"
    },
    {
      icon: Package,
      title: "Pantry Tracker",
      description: "Track your pantry and get smart restock reminders based on your habits"
    }
  ];

  const stats = [
    { value: "50K+", label: "Price Reports" },
    { value: "2,500+", label: "Stores" },
    { value: "100K+", label: "Products" },
    { value: "$2.5M", label: "Saved by Users" }
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">Grocery Waze</span>
          </Link>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost">Dashboard</Button>
                </Link>
                <Link href="/profile">
                  <Button variant="outline">{user?.name || "Profile"}</Button>
                </Link>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button>Get Started</Button>
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="container py-24 md:py-32 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">Crowdsourced Grocery Intelligence</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
              Save Money on Every
              <span className="text-primary"> Grocery Trip</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Compare prices across stores, optimize your shopping route, and join a community 
              of smart shoppers saving thousands on groceries.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isAuthenticated ? (
                <Link href="/dashboard">
                  <Button size="lg" className="gap-2">
                    Go to Dashboard <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg" className="gap-2">
                    Start Saving Today <ArrowRight className="w-4 h-4" />
                  </Button>
                </a>
              )}
              <Link href="/map">
                <Button size="lg" variant="outline" className="gap-2">
                  <MapPin className="w-4 h-4" /> Explore Stores
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="border-y bg-card">
        <div className="container py-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-3xl md:text-4xl font-bold text-primary">{stat.value}</div>
                <div className="text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Everything You Need to Shop Smarter
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Powerful tools to help you find the best prices, plan your trips, and save money
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <Card key={i} className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-muted/50">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              How It Works
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {[
              { step: "1", title: "Add Your List", desc: "Create a shopping list or import from a recipe" },
              { step: "2", title: "Find Best Prices", desc: "We compare prices across nearby stores" },
              { step: "3", title: "Shop & Save", desc: "Follow the optimized route and save money" }
            ].map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground text-2xl font-bold flex items-center justify-center mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community Section */}
      <section className="py-24">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                Join the Community of Smart Shoppers
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Our crowdsourced price data is powered by shoppers like you. Report prices, 
                earn points, and climb the leaderboard while helping everyone save money.
              </p>
              <ul className="space-y-4">
                {[
                  "Earn points for every price report",
                  "Build your trust score with verified submissions",
                  "Compete on weekly and monthly leaderboards",
                  "Unlock achievements and badges"
                ].map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/leaderboard">
                <Button className="mt-8 gap-2">
                  <Trophy className="w-4 h-4" /> View Leaderboard
                </Button>
              </Link>
            </div>
            <Card className="p-8">
              <div className="space-y-4">
                {[
                  { rank: 1, name: "Sarah M.", points: 12450, badge: "🥇" },
                  { rank: 2, name: "John D.", points: 11200, badge: "🥈" },
                  { rank: 3, name: "Emily R.", points: 10890, badge: "🥉" }
                ].map((user) => (
                  <div key={user.rank} className="flex items-center gap-4 p-4 rounded-lg bg-muted/50">
                    <span className="text-2xl">{user.badge}</span>
                    <div className="flex-1">
                      <div className="font-semibold">{user.name}</div>
                      <div className="text-sm text-muted-foreground">{user.points.toLocaleString()} points</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-primary text-primary-foreground">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            Ready to Start Saving?
          </h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Join thousands of smart shoppers who are saving money on every grocery trip.
          </p>
          {isAuthenticated ? (
            <Link href="/dashboard">
              <Button size="lg" variant="secondary" className="gap-2">
                Go to Dashboard <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          ) : (
            <a href={getLoginUrl()}>
              <Button size="lg" variant="secondary" className="gap-2">
                Get Started Free <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">Grocery Waze</span>
            </div>
            <div className="text-sm text-muted-foreground">
              © 2024 Grocery Waze. Helping you shop smarter.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
