import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { trpc } from "@/lib/trpc";
import { MapPin, Search, Star, Navigation, ArrowLeft } from "lucide-react";
import { Link } from "wouter";

// Default to San José (Costa Rica) center when neither user location
// nor geolocation are available.
const COSTA_RICA_CENTER = { lat: 9.9281, lng: -84.0907 };

export default function Stores() {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [radius, setRadius] = useState([user?.defaultRadiusKm ?? 10]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (user?.homeLatitude && user?.homeLongitude) {
      setUserLocation({ lat: user.homeLatitude, lng: user.homeLongitude });
      return;
    }
    if (!navigator.geolocation) {
      setUserLocation(COSTA_RICA_CENTER);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => setUserLocation(COSTA_RICA_CENTER)
    );
  }, [user]);

  const { data: nearbyStores, isLoading: loadingNearby } = trpc.stores.getNearby.useQuery(
    { latitude: userLocation?.lat ?? 0, longitude: userLocation?.lng ?? 0, radiusKm: radius[0] },
    { enabled: !!userLocation }
  );

  const { data: searchResults, isLoading: loadingSearch } = trpc.stores.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 2 }
  );

  const stores = searchQuery.length > 2 ? searchResults : nearbyStores;
  const isLoading = searchQuery.length > 2 ? loadingSearch : loadingNearby;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" aria-label="Volver al tablero">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Tiendas</h1>
        </div>
      </header>

      <main className="container py-6">
        <Card className="mb-6">
          <CardContent className="p-4 space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar tienda o cadena..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            {!searchQuery && (
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
            )}
            {!user?.homeLatitude && (
              <p className="text-xs text-muted-foreground">
                Mostrando tiendas cerca de San José.{" "}
                <Link href="/profile" className="underline text-primary">
                  Configurá tu ubicación
                </Link>{" "}
                para resultados más precisos.
              </p>
            )}
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : stores && stores.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stores.map((store) => (
              <Card key={store.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{store.name}</CardTitle>
                      {store.chainId && (
                        <CardDescription className="capitalize">{store.chainId}</CardDescription>
                      )}
                    </div>
                    {store.avgRating && store.avgRating > 0 && (
                      <div className="flex items-center gap-1 text-sm">
                        <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                        <span>{store.avgRating.toFixed(1)}</span>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {store.address && (
                    <div className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{store.address}{store.city ? `, ${store.city}` : ""}</span>
                    </div>
                  )}
                  {"distanceKm" in store && (
                    <div className="flex items-center gap-2 text-sm">
                      <Navigation className="w-4 h-4 text-primary" />
                      <span className="font-medium">a {(store.distanceKm as number).toFixed(1)} km</span>
                    </div>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Link href={`/map?store=${store.id}`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full gap-1">
                        <MapPin className="w-4 h-4" /> Ver en mapa
                      </Button>
                    </Link>
                    <Link href={`/products?store=${store.id}`} className="flex-1">
                      <Button variant="default" size="sm" className="w-full">
                        Ver precios
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <MapPin className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">No encontramos tiendas</h3>
            <p className="text-muted-foreground">
              {searchQuery ? "Probá con otro término" : "Probá aumentar el radio de búsqueda"}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
