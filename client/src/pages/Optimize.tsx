import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { formatCurrency } from "@/lib/currency";
import {
  ArrowLeft, TrendingDown, MapPin, Clock, Fuel,
  Store, Sparkles, ShoppingCart, Check
} from "lucide-react";
import { Link, useSearch } from "wouter";
import { toast } from "sonner";

export default function Optimize() {
  const { user, isAuthenticated } = useAuth();
  const searchParams = new URLSearchParams(useSearch());
  const listId = searchParams.get("list");
  const [radius, setRadius] = useState([user?.defaultRadiusKm || 10]);
  const [selectedResult, setSelectedResult] = useState<number | null>(null);

  const { data: list } = trpc.lists.getById.useQuery(
    { id: parseInt(listId || "0", 10) },
    { enabled: !!listId }
  );

  const productIds = useMemo(
    () =>
      list?.items
        .filter((item) => item.productId && !item.isChecked)
        .map((item) => item.productId as number) ?? [],
    [list?.items]
  );

  const optimize = trpc.optimization.optimize.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const runOptimize = (ids: number[], radiusKm: number) => {
    if (ids.length === 0) {
      toast.error("No products to optimize");
      return;
    }
    optimize.mutate({ productIds: ids, radiusKm });
  };

  const handleOptimize = () => runOptimize(productIds, radius[0]);

  // Auto-run optimization once when the list is first loaded with items.
  const autoRunFiredRef = useRef(false);
  useEffect(() => {
    if (autoRunFiredRef.current) return;
    if (productIds.length === 0) return;
    autoRunFiredRef.current = true;
    runOptimize(productIds, radius[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productIds.length]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <TrendingDown className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h2 className="text-xl font-bold mb-2">Sesión requerida</h2>
            <p className="text-muted-foreground mb-4">
              Inicia sesión para usar el optimizador de Carrito Inteligente
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!user?.homeLatitude || !user?.homeLongitude) {
    return (
      <div className="min-h-screen bg-background">
        <header className="border-b bg-card sticky top-0 z-50">
          <div className="container flex h-16 items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <h1 className="text-xl font-bold">Carrito Inteligente</h1>
          </div>
        </header>
        <main className="container py-12">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <MapPin className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">Define tu ubicación</h2>
              <p className="text-muted-foreground mb-4">
                Configura tu ubicación en tu perfil para empezar a optimizar tus compras
              </p>
              <Link href="/profile">
                <Button>Ir a perfil</Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href={listId ? `/lists/${listId}` : "/dashboard"}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">Carrito Inteligente</h1>
            {list && <p className="text-sm text-muted-foreground">{list.name}</p>}
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* Settings */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Configuración de optimización</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Radio de búsqueda</span>
                <span className="text-sm text-muted-foreground">{radius[0]} km</span>
              </div>
              <Slider
                value={radius}
                onValueChange={setRadius}
                min={1}
                max={50}
                step={1}
              />
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Fuel className="w-4 h-4 text-muted-foreground" />
                <span>Combustible: {formatCurrency(user.fuelCostPerKm ?? 250)}/km</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>Tiempo: {formatCurrency(user.timeValuePerHour ?? 3000)}/h</span>
              </div>
            </div>
            <Button
              onClick={handleOptimize}
              disabled={optimize.isPending || productIds.length === 0}
              className="w-full gap-2"
            >
              {optimize.isPending ? (
                <>
                  <div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  Optimizando...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Encontrar mejor estrategia
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {optimize.data && optimize.data.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <TrendingDown className="w-5 h-5 text-primary" />
              Estrategias de compra
            </h2>
            {optimize.data.map((result, index) => (
              <Card
                key={index}
                className={`cursor-pointer transition-all ${
                  selectedResult === index ? "ring-2 ring-primary" : "hover:shadow-md"
                }`}
                onClick={() => setSelectedResult(index)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        {result.type === "SINGLE" ? (
                          <Store className="w-5 h-5" />
                        ) : (
                          <div className="flex -space-x-2">
                            <Store className="w-5 h-5" />
                            <Store className="w-5 h-5" />
                          </div>
                        )}
                        {result.type === "SINGLE" ? "Una sola tienda" : "Viaje dividido"}
                      </CardTitle>
                      <CardDescription>
                        {result.stores.map((s) => s.name).join(" → ")}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        {formatCurrency(result.grandTotal)}
                      </div>
                      {result.savings && result.savings > 0 && (
                        <Badge className="bg-green-500">
                          Ahorrá {formatCurrency(result.savings)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Carrito</div>
                      <div className="font-semibold">
                        {formatCurrency(result.cartTotal)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Traslado</div>
                      <div className="font-semibold flex items-center gap-1">
                        <Fuel className="w-4 h-4" />
                        {formatCurrency(result.tripCost)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Productos</div>
                      <div className="font-semibold flex items-center gap-1">
                        <ShoppingCart className="w-4 h-4" />
                        {result.foundItemCount} <span className="text-muted-foreground font-normal">de {result.requestedItemCount}</span>
                      </div>
                    </div>
                  </div>

                  {selectedResult === index && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <h4 className="font-medium text-sm">Detalle por producto</h4>
                      {result.itemBreakdown.slice(0, 5).map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="truncate flex-1">{item.productName}</span>
                          <span className="text-muted-foreground mx-2">@</span>
                          <span className="text-muted-foreground">{item.storeName}</span>
                          <span className="font-medium ml-2">{formatCurrency(item.price)}</span>
                        </div>
                      ))}
                      {result.itemBreakdown.length > 5 && (
                        <p className="text-sm text-muted-foreground">
                          +{result.itemBreakdown.length - 5} productos más
                        </p>
                      )}
                      {result.missingItems.length > 0 && (
                        <p className="text-sm text-destructive">
                          {result.missingItems.length} productos no disponibles
                        </p>
                      )}
                      <Button className="w-full mt-4 gap-2">
                        <Check className="w-4 h-4" /> Usar esta estrategia
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        ) : optimize.data && optimize.data.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Store className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">Sin resultados</h3>
              <p className="text-muted-foreground">
                Probá aumentar el radio de búsqueda o agregar más productos a tu lista
              </p>
            </CardContent>
          </Card>
        ) : !optimize.isPending && productIds.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">No hay productos para optimizar</h3>
              <p className="text-muted-foreground mb-4">
                Agregá productos a tu lista para encontrar los mejores precios
              </p>
              <Link href="/lists">
                <Button>Ir a listas</Button>
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
