import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, TrendingDown, MapPin, DollarSign, Clock, Fuel,
  Store, ArrowRight, Sparkles, ShoppingCart, Check
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
    { id: parseInt(listId || "0") },
    { enabled: !!listId }
  );

  const productIds = list?.items
    .filter((item) => item.productId && !item.isChecked)
    .map((item) => item.productId as number) || [];

  const optimize = trpc.optimization.optimize.useMutation({
    onError: (err) => toast.error(err.message),
  });

  const handleOptimize = () => {
    if (productIds.length === 0) {
      toast.error("No products to optimize");
      return;
    }
    optimize.mutate({ productIds, radiusKm: radius[0] });
  };

  useEffect(() => {
    if (productIds.length > 0 && !optimize.data && !optimize.isPending) {
      handleOptimize();
    }
  }, [productIds.length]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <TrendingDown className="w-16 h-16 mx-auto mb-4 text-primary" />
            <h2 className="text-xl font-bold mb-2">Sign In Required</h2>
            <p className="text-muted-foreground mb-4">
              Please sign in to use the Smart Cart optimizer
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
            <h1 className="text-xl font-bold">Smart Cart Optimizer</h1>
          </div>
        </header>
        <main className="container py-12">
          <Card className="max-w-md mx-auto">
            <CardContent className="p-8 text-center">
              <MapPin className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-xl font-bold mb-2">Set Your Location</h2>
              <p className="text-muted-foreground mb-4">
                Please set your home location in your profile to use the optimizer
              </p>
              <Link href="/profile">
                <Button>Go to Profile</Button>
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
            <h1 className="text-xl font-bold">Smart Cart Optimizer</h1>
            {list && <p className="text-sm text-muted-foreground">{list.name}</p>}
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* Settings */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Optimization Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Search Radius</span>
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
                <span>Fuel: ${user.fuelCostPerKm?.toFixed(2) || "0.15"}/km</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span>Time: ${user.timeValuePerHour?.toFixed(0) || "15"}/hr</span>
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
                  Optimizing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Find Best Strategy
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
              Shopping Strategies
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
                        {result.type === "SINGLE" ? "Single Store" : "Split Trip"}
                      </CardTitle>
                      <CardDescription>
                        {result.stores.map((s) => s.name).join(" → ")}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-primary">
                        ${result.grandTotal.toFixed(2)}
                      </div>
                      {result.savings && result.savings > 0 && (
                        <Badge className="bg-green-500">
                          Save ${result.savings.toFixed(2)}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Cart</div>
                      <div className="font-semibold flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />
                        {result.cartTotal.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Travel</div>
                      <div className="font-semibold flex items-center gap-1">
                        <Fuel className="w-4 h-4" />
                        {result.tripCost.toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Items</div>
                      <div className="font-semibold flex items-center gap-1">
                        <ShoppingCart className="w-4 h-4" />
                        {result.itemBreakdown.length}
                      </div>
                    </div>
                  </div>

                  {selectedResult === index && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <h4 className="font-medium text-sm">Item Breakdown</h4>
                      {result.itemBreakdown.slice(0, 5).map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="truncate flex-1">{item.productName}</span>
                          <span className="text-muted-foreground mx-2">@</span>
                          <span className="text-muted-foreground">{item.storeName}</span>
                          <span className="font-medium ml-2">${item.price.toFixed(2)}</span>
                        </div>
                      ))}
                      {result.itemBreakdown.length > 5 && (
                        <p className="text-sm text-muted-foreground">
                          +{result.itemBreakdown.length - 5} more items
                        </p>
                      )}
                      {result.missingItems.length > 0 && (
                        <p className="text-sm text-destructive">
                          {result.missingItems.length} items not available
                        </p>
                      )}
                      <Button className="w-full mt-4 gap-2">
                        <Check className="w-4 h-4" /> Use This Strategy
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
              <h3 className="text-lg font-medium mb-2">No Results Found</h3>
              <p className="text-muted-foreground">
                Try increasing your search radius or adding more items to your list
              </p>
            </CardContent>
          </Card>
        ) : !optimize.isPending && productIds.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-medium mb-2">No Items to Optimize</h3>
              <p className="text-muted-foreground mb-4">
                Add products to your shopping list to find the best prices
              </p>
              <Link href="/lists">
                <Button>Go to Lists</Button>
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </main>
    </div>
  );
}
