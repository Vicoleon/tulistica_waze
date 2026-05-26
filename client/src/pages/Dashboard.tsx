import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { SponsoredCard } from "@/components/SponsoredCard";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getLoginUrl } from "@/const";
import {
  ArrowRight,
  BellRing,
  ChefHat,
  MapPin,
  Package,
  Plus,
  Sparkles,
  TrendingDown,
  Trophy,
} from "lucide-react";
import { FormEvent, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

// TODO: wire to useShoppingLists() — shape used here:
// { name: string; estimatedTotal: number; itemCount: number; cheapestStore: string; savings: number;
//   items: Array<{ id: string; name: string; qty: string; estPrice: number }> }
const activeListMock = {
  name: "Mi lista · sábado 30 may",
  itemCount: 14,
  estimatedTotal: 12_400,
  cheapestStore: "PriceSmart",
  savings: 1_860,
  items: [
    { id: "1", name: "Arroz Tío Pelón 1.8 kg", qty: "x1", estPrice: 2_490 },
    { id: "2", name: "Frijoles negros 900 g", qty: "x2", estPrice: 1_790 },
    { id: "3", name: "Leche Dos Pinos 1 L", qty: "x3", estPrice: 990 },
    { id: "4", name: "Aceite Capullo 1 L", qty: "x1", estPrice: 3_250 },
    { id: "5", name: "Pollo entero fresco", qty: "x1", estPrice: 4_100 },
  ],
};

// TODO: wire to usePantryAlerts() — count + 3 sample names
const pantryAlertMock = {
  count: 3,
  sample: "aceite, sal, café",
};

// TODO: wire to useUserStats() / useLeaderboard()
const rankingMock = {
  position: 142,
  weeklyDelta: +8,
  pointsThisWeek: 230,
};

// TODO: wire to usePriceDropAlerts()
const priceDropsMock = [
  { id: "p1", name: "Café 1820 250 g", store: "Auto Mercado", drop: 380 },
  { id: "p2", name: "Detergente Xedex 3 L", store: "Walmart", drop: 720 },
];

// TODO: wire to useRecipeSuggestions()
const suggestedRecipeMock = {
  title: "Olla de carne tradicional",
  matchPct: 82,
  missingCount: 2,
};

function formatColones(amount: number): string {
  return `₡ ${amount.toLocaleString("es-CR")}`;
}

export default function Dashboard() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [quickAddValue, setQuickAddValue] = useState("");

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  const firstName = user?.name?.split(" ")[0] || "compradora";

  const handleQuickAdd = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = quickAddValue.trim();
    if (!value) return;
    // TODO: wire to addItem mutation (active list)
    toast.success("Agregado a tu lista", {
      description: value,
    });
    setQuickAddValue("");
  };

  return (
    <div className="space-y-8 max-w-6xl">
      <VerifyEmailBanner emailVerified={user?.emailVerified ?? true} />
      {/* 1 · Greeting */}
      <header className="space-y-2">
        <h1 className="font-serif text-3xl md:text-4xl font-semibold tracking-tight text-foreground">
          Buenos días,{" "}
          <span className="font-serif italic text-primary">{firstName}</span>.
        </h1>
        <p className="text-muted-foreground text-base">
          Tu lista de esta semana tiene{" "}
          <span className="font-mono font-semibold text-foreground">
            {activeListMock.itemCount}
          </span>{" "}
          productos · estimado{" "}
          <span className="font-mono font-semibold text-foreground">
            {formatColones(activeListMock.estimatedTotal)}
          </span>
          .
        </p>
      </header>

      {/* 2 · Hero row: active list (lg:2/3) + side rail (lg:1/3) */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Active list card */}
        <Card className="lg:col-span-2 rounded-3xl border-border bg-card shadow-paper">
          <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground/80 font-semibold">
                Tu canasta de la semana
              </p>
              <CardTitle className="font-serif text-2xl font-semibold tracking-tight mt-1">
                {activeListMock.name}
              </CardTitle>
            </div>
            <Link
              href="/lists"
              className="text-sm text-primary hover:underline shrink-0 whitespace-nowrap pt-1"
            >
              ver lista completa
            </Link>
          </CardHeader>
          <CardContent className="space-y-5">
            <ul className="divide-y divide-dashed divide-border">
              {activeListMock.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between py-3 first:pt-0"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary/50 shrink-0" />
                    <span className="text-sm text-foreground truncate">
                      {item.name}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono shrink-0">
                      {item.qty}
                    </span>
                  </div>
                  <span className="text-sm font-mono font-semibold text-foreground shrink-0 ml-3">
                    {formatColones(item.estPrice)}
                  </span>
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-secondary-foreground">
                <TrendingDown className="h-3.5 w-3.5" strokeWidth={2} />
                Ahorrás{" "}
                <span className="font-mono font-semibold">
                  {formatColones(activeListMock.savings)}
                </span>{" "}
                si comprás en {activeListMock.cheapestStore}
              </span>
              <Button
                onClick={() => setLocation("/optimize")}
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 self-start sm:self-auto"
              >
                Ver plan de compra
                <ArrowRight className="ml-1.5 h-4 w-4" strokeWidth={2} />
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 5 · Side rail */}
        <aside className="space-y-4">
          {/* Sponsored placement (Fase 2 · brand promo) */}
          <SponsoredSidebarSlot />

          {/* Ranking */}
          <Card className="rounded-2xl border-border bg-card">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-3">
                <Trophy
                  className="h-3.5 w-3.5 text-primary"
                  strokeWidth={1.8}
                />
                Tu ranking
              </div>
              <div className="flex items-baseline gap-2">
                <span className="font-serif text-3xl font-semibold text-foreground">
                  #{rankingMock.position}
                </span>
                <span className="text-xs text-secondary-foreground font-medium">
                  +{rankingMock.weeklyDelta} esta semana
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-mono font-semibold text-foreground">
                  {rankingMock.pointsThisWeek}
                </span>{" "}
                puntos por reportar precios
              </p>
              <Link
                href="/leaderboard"
                className="inline-flex items-center text-xs text-primary mt-3 hover:underline"
              >
                Ver el ranking
                <ArrowRight className="ml-1 h-3 w-3" strokeWidth={2} />
              </Link>
            </CardContent>
          </Card>

          {/* Price drops */}
          <Card className="rounded-2xl border-border bg-card">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-3">
                <BellRing
                  className="h-3.5 w-3.5 text-primary"
                  strokeWidth={1.8}
                />
                Bajaron de precio
              </div>
              <ul className="space-y-3">
                {priceDropsMock.map((drop) => (
                  <li
                    key={drop.id}
                    className="flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-foreground truncate">
                        {drop.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {drop.store}
                      </p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-secondary-foreground bg-secondary px-2 py-0.5 rounded-full shrink-0">
                      -{formatColones(drop.drop)}
                    </span>
                  </li>
                ))}
              </ul>
              <Link
                href="/alerts"
                className="inline-flex items-center text-xs text-primary mt-3 hover:underline"
              >
                Mis alertas
                <ArrowRight className="ml-1 h-3 w-3" strokeWidth={2} />
              </Link>
            </CardContent>
          </Card>

          {/* Suggested recipe */}
          <Card className="rounded-2xl border-border bg-card">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold mb-3">
                <ChefHat
                  className="h-3.5 w-3.5 text-primary"
                  strokeWidth={1.8}
                />
                Receta sugerida
              </div>
              <p className="font-serif text-base font-semibold text-foreground">
                {suggestedRecipeMock.title}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Ya tenés{" "}
                <span className="font-mono font-semibold text-foreground">
                  {suggestedRecipeMock.matchPct}%
                </span>{" "}
                de los ingredientes ·{" "}
                {suggestedRecipeMock.missingCount} faltantes
              </p>
              <Link
                href="/recipes"
                className="inline-flex items-center text-xs text-primary mt-3 hover:underline"
              >
                Ver recetario
                <ArrowRight className="ml-1 h-3 w-3" strokeWidth={2} />
              </Link>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* 3 · Quick add bar */}
      <Card className="rounded-2xl border-border bg-paper-deep/40">
        <CardContent className="p-4 sm:p-5">
          <form
            onSubmit={handleQuickAdd}
            className="flex flex-col sm:flex-row gap-3"
          >
            <div className="flex-1">
              <label
                htmlFor="quick-add"
                className="sr-only"
              >
                Agregar producto a la lista
              </label>
              <Input
                id="quick-add"
                value={quickAddValue}
                onChange={(e) => setQuickAddValue(e.target.value)}
                placeholder="Agregá algo a tu lista…"
                className="h-12 rounded-xl bg-card border-border text-base focus-visible:ring-primary"
              />
            </div>
            <Button
              type="submit"
              size="lg"
              className="h-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 px-6 shrink-0"
            >
              <Plus className="h-5 w-5" strokeWidth={2} />
              <span className="ml-1">Agregar</span>
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 4 · Three smaller tiles */}
      <div className="grid gap-4 md:grid-cols-3">
        <TileCard
          icon={Sparkles}
          eyebrow="Plan de compra"
          title="Plan de compra esta semana"
          description="Calculamos la mezcla más barata de tiendas para tu canasta."
          ctaLabel="Calcular ahora"
          onClick={() => setLocation("/optimize")}
          accent="primary"
        />
        <TileCard
          icon={Package}
          eyebrow="Despensa"
          title={`Despensa: ${pantryAlertMock.count} cosas se acaban pronto`}
          description={`Pronto se acaba: ${pantryAlertMock.sample}.`}
          ctaLabel="Ver despensa"
          onClick={() => setLocation("/pantry")}
          accent="butter"
        />
        <TileCard
          icon={MapPin}
          eyebrow="Tiendas"
          title="Tiendas cerca de hoy"
          description="Conocé qué supermercados te quedan a tiro de barrio."
          ctaLabel="Abrir mapa"
          onClick={() => setLocation("/map")}
          accent="sage"
        />
      </div>
    </div>
  );
}

type TileAccent = "primary" | "butter" | "sage";

type TileCardProps = {
  icon: typeof Sparkles;
  eyebrow: string;
  title: string;
  description: string;
  ctaLabel: string;
  onClick: () => void;
  accent: TileAccent;
};

const accentBackground: Record<TileAccent, string> = {
  primary: "bg-primary/10 text-primary",
  butter: "bg-butter-soft text-butter-foreground",
  sage: "bg-sage-soft text-secondary-foreground",
};

function TileCard({
  icon: Icon,
  eyebrow,
  title,
  description,
  ctaLabel,
  onClick,
  accent,
}: TileCardProps) {
  return (
    <Card className="rounded-2xl border-border bg-card hover:-translate-y-0.5 transition-transform motion-reduce:transform-none">
      <CardContent className="p-5 space-y-4 flex flex-col h-full">
        <div className="flex items-start justify-between gap-3">
          <div
            className={`h-10 w-10 rounded-xl flex items-center justify-center ${accentBackground[accent]}`}
          >
            <Icon className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
            {eyebrow}
          </span>
        </div>
        <div className="flex-1 space-y-2">
          <h3 className="font-serif text-lg font-semibold tracking-tight text-foreground leading-snug">
            {title}
          </h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
        <Button
          variant="ghost"
          onClick={onClick}
          className="self-start rounded-full text-primary hover:bg-primary/10 hover:text-primary px-3 -ml-3"
        >
          {ctaLabel}
          <ArrowRight className="ml-1 h-4 w-4" strokeWidth={2} />
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Fetches a single eligible `dashboard_promo` campaign for the viewer.
 * Renders nothing if no campaign matches the profile — never shows a
 * placeholder ad slot. Sits at the top of the side rail.
 */
function SponsoredSidebarSlot() {
  const { data } = trpc.campaigns.getForSurface.useQuery({
    surface: "dashboard_promo",
    limit: 1,
  });
  const placement = data?.[0];
  if (!placement) return null;
  return <SponsoredCard placement={placement} variant="full" />;
}
