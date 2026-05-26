import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, ArrowRight, Clock, Fuel, MapPin, Play, Route,
  ShoppingBasket, Sparkles, Store, TrendingDown, Check,
} from "lucide-react";
import { Link, useSearch, useLocation } from "wouter";
import { toast } from "sonner";

const STRATEGY_STORAGE_KEY = "tulistica.activeStrategy";

function formatColones(amount: number): string {
  return `₡ ${new Intl.NumberFormat("es-CR").format(Math.round(amount))}`;
}

function strategyLabel(type: string | undefined, index: number): string {
  if (type === "SINGLE") return "Una sola tienda";
  if (index === 1) return "Ruta dividida";
  return "Tienda más cercana";
}

function strategySubline(type: string | undefined, index: number): string {
  if (type === "SINGLE") return "Todo el mandado en un solo lugar.";
  if (index === 1) return "Dividís el mandado entre dos tiendas para gastar menos.";
  return "Comprás todo en la tienda más cerca de tu casa.";
}

function StrategyIcon({ type }: { type?: string }) {
  if (type === "SINGLE") {
    return <Store className="h-5 w-5" />;
  }
  return <Route className="h-5 w-5" />;
}

export default function Optimize() {
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const listId = searchParams.get("list");
  const [radius, setRadius] = useState([user?.defaultRadiusKm || 10]);
  const [selectedResult, setSelectedResult] = useState<number | null>(null);
  const [manualTrigger, setManualTrigger] = useState(false);

  const { data: list } = trpc.lists.getById.useQuery(
    { id: parseInt(listId || "0") },
    { enabled: !!listId }
  );

  const productIds = useMemo(
    () => list?.items
      ?.filter((item) => item.productId && !item.isChecked)
      ?.map((item) => item.productId as number) ?? [],
    [list?.items]
  );

  const optimize = trpc.optimization.optimize.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const handleOptimize = () => {
    if (productIds.length === 0) {
      toast.error("No hay productos para planear");
      return;
    }
    setManualTrigger(true);
    setSelectedResult(null);
    optimize.reset();
    optimize.mutate({ productIds, radiusKm: radius[0] });
  };

  useEffect(() => {
    if (!manualTrigger && productIds.length > 0 && !optimize.data && !optimize.isPending) {
      optimize.mutate({ productIds, radiusKm: radius[0] });
    }
  }, [productIds.length, manualTrigger]);

  const handleApplyStrategy = (index: number) => {
    const result = optimize.data?.[index];
    if (!result) return;
    try {
      localStorage.setItem(
        STRATEGY_STORAGE_KEY,
        JSON.stringify({
          listId: listId ? parseInt(listId) : null,
          stores: result.stores,
          itemBreakdown: result.itemBreakdown,
          grandTotal: result.grandTotal,
          appliedAt: new Date().toISOString(),
        })
      );
    } catch {
      // localStorage may be unavailable (private mode); fall through to navigation
    }
    toast.success(`Strategy applied — ${result.stores.length} store${result.stores.length > 1 ? "s" : ""}`);
    const storeIds = result.stores.map((s) => s.id).join(",");
    setLocation(`/map?stores=${storeIds}`);
  };

  // Identify recommended (cheapest) result
  const recommendedIndex = useMemo(() => {
    const data = optimize.data;
    if (!data || data.length === 0) return -1;
    let bestIdx = 0;
    for (let i = 1; i < data.length; i += 1) {
      if (data[i].grandTotal < data[bestIdx].grandTotal) {
        bestIdx = i;
      }
    }
    return bestIdx;
  }, [optimize.data]);

  const recommended = recommendedIndex >= 0 ? optimize.data?.[recommendedIndex] : undefined;
  const activeIndex = selectedResult !== null ? selectedResult : recommendedIndex;

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-3xl border border-border bg-card p-10 text-center shadow-paper">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-peach-soft text-accent-foreground">
            <TrendingDown className="h-8 w-8" />
          </div>
          <h2 className="mt-5 font-serif text-2xl font-semibold tracking-tight">
            Entrá para ver tu plan
          </h2>
          <p className="mt-2 font-serif italic text-muted-foreground">
            Tu plan de compra te espera con los precios de la semana.
          </p>
        </div>
      </div>
    );
  }

  if (!user?.homeLatitude || !user?.homeLongitude) {
    return (
      <div className="min-h-screen bg-background">
        <main className="container max-w-2xl py-16">
          <div className="rounded-3xl border border-border bg-card p-10 text-center shadow-paper">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-sky-soft text-sky-foreground">
              <MapPin className="h-8 w-8" />
            </div>
            <h2 className="mt-5 font-serif text-2xl font-semibold tracking-tight">
              Decinos dónde vivís
            </h2>
            <p className="mt-2 font-serif italic text-muted-foreground">
              Sin tu casa en el mapa no podemos armarte un plan de ruta.
            </p>
            <Link href="/profile">
              <Button className="mt-6 h-11 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90">
                Ir a mi perfil
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-12">
      <main className="container max-w-5xl py-10 sm:py-14">
        {/* Breadcrumb */}
        <div className="mb-6 flex items-center gap-3 text-sm">
          <Link
            href={listId ? `/lists/${listId}` : "/lists"}
            className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-muted-foreground transition-colors duration-200 hover:bg-paper-deep hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>{list?.name || "Mis listas"}</span>
          </Link>
        </div>

        {/* Header */}
        <header className="mb-10">
          <p className="font-serif italic text-sm uppercase tracking-[0.18em] text-muted-foreground">
            Plan de compra
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Plan de compra · <em className="font-serif italic text-primary">esta semana</em>
          </h1>
          <p className="mt-3 max-w-xl font-serif italic text-muted-foreground">
            Tres maneras de comprar tu lista. Te recomendamos la más barata.
          </p>
        </header>

        {/* Settings strip */}
        <div className="mb-8 rounded-3xl border border-border bg-card p-5 shadow-paper sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <div className="flex items-center justify-between gap-3">
                <span className="font-serif italic text-sm text-muted-foreground">
                  Buscar dentro de
                </span>
                <span className="font-mono text-sm font-semibold text-foreground">
                  {radius[0]} km
                </span>
              </div>
              <Slider
                value={radius}
                onValueChange={setRadius}
                min={1}
                max={50}
                step={1}
                className="mt-3"
              />
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <Fuel className="h-4 w-4" />
                <span>Combustible ${user.fuelCostPerKm?.toFixed(2) || "0.15"}/km</span>
              </div>
              <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
                <Clock className="h-4 w-4" />
                <span>Tiempo ${user.timeValuePerHour?.toFixed(0) || "15"}/h</span>
              </div>
              <Button
                onClick={handleOptimize}
                disabled={optimize.isPending || productIds.length === 0}
                size="sm"
                className="h-11 gap-2 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90"
              >
                {optimize.isPending ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Calculando…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" /> Recalcular
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        {/* Results */}
        {optimize.data && optimize.data.length > 0 ? (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {optimize.data.map((result, index) => {
                const isRecommended = index === recommendedIndex;
                const isActive = activeIndex === index;
                const savings = result.savings ?? 0;
                return (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setSelectedResult(index)}
                    className={`relative flex flex-col items-stretch rounded-3xl border p-6 text-left shadow-paper transition-all duration-200 hover:-translate-y-0.5 hover:shadow-paper-lg ${
                      isRecommended
                        ? "border-secondary bg-secondary/20"
                        : "border-border bg-card"
                    } ${isActive ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : ""}`}
                  >
                    {isRecommended && (
                      <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-secondary-foreground">
                        <Sparkles className="h-3 w-3" /> Recomendado
                      </span>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <StrategyIcon type={result.type} />
                      <span className="font-serif text-lg font-semibold tracking-tight text-foreground">
                        {strategyLabel(result.type, index)}
                      </span>
                    </div>
                    <p className="mt-3 font-mono text-3xl font-semibold tracking-tight text-foreground">
                      {formatColones(result.grandTotal)}
                    </p>
                    {savings > 0 ? (
                      <p className="mt-1 font-mono text-sm text-secondary-foreground">
                        Ahorrás {formatColones(savings)}
                      </p>
                    ) : (
                      <p className="mt-1 font-mono text-sm text-muted-foreground">
                        Misma base de comparación
                      </p>
                    )}
                    <p className="mt-4 font-serif italic text-sm text-muted-foreground">
                      {strategySubline(result.type, index)}
                    </p>
                    <div className="mt-5 flex items-center justify-between border-t border-dashed border-border pt-4 font-mono text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Store className="h-3.5 w-3.5" />
                        {result.stores.length} {result.stores.length === 1 ? "tienda" : "tiendas"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        ~{Math.max(15, Math.round(result.tripCost * 5 + 20))} min
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Step-by-step route for the active (or recommended) strategy */}
            {activeIndex !== null && optimize.data[activeIndex] && (
              <div className="mt-10 overflow-hidden rounded-3xl border border-border bg-card shadow-paper">
                <div className="flex flex-col gap-2 border-b border-dashed border-border bg-paper-deep px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-serif italic text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Tu ruta paso a paso
                    </p>
                    <h2 className="mt-1 font-serif text-xl font-semibold tracking-tight">
                      {strategyLabel(optimize.data[activeIndex].type, activeIndex)} ·{" "}
                      <span className="font-mono">
                        {formatColones(optimize.data[activeIndex].grandTotal)}
                      </span>
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <ShoppingBasket className="h-3.5 w-3.5" />
                      Productos: {formatColones(optimize.data[activeIndex].cartTotal)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Fuel className="h-3.5 w-3.5" />
                      Traslado: {formatColones(optimize.data[activeIndex].tripCost)}
                    </span>
                  </div>
                </div>

                <ol className="divide-y divide-dashed divide-border">
                  {optimize.data[activeIndex].stores.map((store, stopIndex) => {
                    const storeItems = optimize.data[activeIndex].itemBreakdown.filter(
                      (it) => it.storeName === store.name
                    );
                    const subtotal = storeItems.reduce((sum, it) => sum + it.price, 0);
                    return (
                      <li key={`${store.name}-${stopIndex}`} className="flex flex-col gap-3 px-6 py-5 sm:flex-row">
                        <div className="flex items-start gap-4 sm:w-64 sm:shrink-0">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-base font-semibold text-primary-foreground">
                            {stopIndex + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-serif text-lg font-semibold tracking-tight">
                              {store.name}
                            </p>
                            {"address" in store && typeof (store as { address?: unknown }).address === "string" ? (
                              <p className="mt-0.5 font-serif italic text-sm text-muted-foreground">
                                {(store as { address: string }).address}
                              </p>
                            ) : (
                              <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                {/* TODO: hook to store address when available */}
                                Dirección por confirmar
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex-1 space-y-2">
                          <p className="font-serif italic text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            Llevás de acá
                          </p>
                          <ul className="space-y-1.5">
                            {storeItems.slice(0, 6).map((it, i) => (
                              <li key={i} className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="truncate text-foreground flex items-center gap-1.5">
                                  {it.productName}
                                  {it.source === "estimated" && (
                                    <span
                                      className="inline-flex items-center rounded-full bg-butter-soft px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-butter-foreground"
                                      title="Precio estimado a partir del margen de cada cadena. Recordá compartir el precio real cuando estés en el súper para que otros lo vean."
                                    >
                                      estimado
                                    </span>
                                  )}
                                </span>
                                <span className="font-mono text-muted-foreground">
                                  {formatColones(it.price)}
                                </span>
                              </li>
                            ))}
                            {storeItems.length > 6 && (
                              <li className="font-serif italic text-xs text-muted-foreground">
                                +{storeItems.length - 6} productos más
                              </li>
                            )}
                          </ul>
                          <div className="flex items-center justify-between border-t border-dashed border-border pt-2 font-mono text-sm">
                            <span className="text-muted-foreground">Subtotal acá</span>
                            <span className="font-semibold text-foreground">
                              {formatColones(subtotal)}
                            </span>
                          </div>
                          {storeItems.some((it) => it.source === "estimated") && (
                            <p className="pt-1 font-serif italic text-[11px] text-muted-foreground">
                              Algunos precios son estimados. Cuando estés en el súper, compartí el precio real para que otros lo vean.
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>

                {recommended && recommended.missingItems.length > 0 && (
                  <div className="border-t border-dashed border-border bg-rose-soft px-6 py-4 text-sm text-destructive">
                    {recommended.missingItems.length}{" "}
                    {recommended.missingItems.length === 1
                      ? "producto no se consiguió en ninguna tienda"
                      : "productos no se consiguieron en ninguna tienda"}
                    .
                  </div>
                )}

                {activeIndex !== null && (
                  <div className="border-t border-dashed border-border bg-paper-deep px-6 py-4">
                    <Button
                      className="w-full gap-2 rounded-full h-12"
                      onClick={() => handleApplyStrategy(activeIndex)}
                    >
                      <Check className="h-4 w-4" />
                      Usar esta ruta
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        ) : optimize.data && optimize.data.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-paper">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-peach-soft text-accent-foreground">
              <Store className="h-8 w-8" />
            </div>
            <h3 className="mt-5 font-serif text-xl font-semibold tracking-tight">
              No encontramos un plan cerca tuyo.
            </h3>
            <p className="mt-2 font-serif italic text-muted-foreground">
              Ampliá el radio de búsqueda o agregá productos identificables a tu lista.
            </p>
          </div>
        ) : !optimize.isPending && productIds.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-paper">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-peach-soft text-accent-foreground">
              <ShoppingBasket className="h-8 w-8" />
            </div>
            <h3 className="mt-5 font-serif text-xl font-semibold tracking-tight">
              Tu lista todavía no tiene productos por planear.
            </h3>
            <p className="mt-2 font-serif italic text-muted-foreground">
              Agregale algo a la lista y volvemos con el plan más barato.
            </p>
            <Link href={listId ? `/lists/${listId}` : "/lists"}>
              <Button className="mt-6 h-11 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90">
                Volver a la lista
              </Button>
            </Link>
          </div>
        ) : null}
      </main>

      {/* Sticky mobile bottom bar */}
      {optimize.data && optimize.data.length > 0 && activeIndex !== null && (
        <div className="sticky bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 px-4 py-3 shadow-paper-lg backdrop-blur lg:hidden">
          <Button
            className="h-12 w-full justify-between gap-2 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90"
            onClick={() => {
              // TODO: wire to start-trip mutation
              toast.info("Marcado como en curso");
            }}
          >
            <span className="inline-flex items-center gap-2">
              <Play className="h-4 w-4" />
              Empezar a comprar
            </span>
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
