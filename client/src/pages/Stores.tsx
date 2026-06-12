import { useState, useEffect, useMemo } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";
import { ANALYTICS_EVENTS } from "../../../shared/analytics";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { MapPin, Search, Star, Navigation, Store as StoreIcon } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

// Stable rotation of soft warm tints for the logo bubble.
const LOGO_TINTS = [
  "bg-peach-soft text-accent-foreground",
  "bg-sage-soft text-secondary-foreground",
  "bg-butter-soft text-butter-foreground",
  "bg-rose-soft text-rose-foreground",
  "bg-sky-soft text-sky-foreground",
];

function tintFor(seed: string | number): string {
  const s = String(seed);
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return LOGO_TINTS[Math.abs(hash) % LOGO_TINTS.length];
}

function initialOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : "T";
}

export default function Stores() {
  const { user } = useAuth();
  const { track } = useAnalytics();
  const [searchQuery, setSearchQuery] = useState("");
  const [radius, setRadius] = useState([10]);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (user?.homeLatitude && user?.homeLongitude) {
      setUserLocation({ lat: user.homeLatitude, lng: user.homeLongitude });
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserLocation({ lat: 9.9281, lng: -84.0907 }) // Default to San José, Costa Rica
      );
    }
  }, [user]);

  const { data: nearbyStores, isLoading: loadingNearby } = trpc.stores.getNearby.useQuery(
    { latitude: userLocation?.lat || 0, longitude: userLocation?.lng || 0, radiusKm: radius[0] },
    { enabled: !!userLocation }
  );

  const { data: searchResults, isLoading: loadingSearch } = trpc.stores.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 2 }
  );

  const stores = searchQuery.length > 2 ? searchResults : nearbyStores;
  const isLoading = searchQuery.length > 2 ? loadingSearch : loadingNearby;

  // Helper to derive tag chips per store. Tags come from chainId and city.
  const storesWithTags = useMemo(() => {
    if (!stores) return [];
    return stores.map((store) => {
      const tags: { label: string; tint: string }[] = [];
      if (store.chainId) {
        tags.push({
          label: String(store.chainId).replace(/[-_]/g, " "),
          tint: "bg-peach-soft text-accent-foreground border-accent/30",
        });
      }
      if (store.city) {
        tags.push({
          label: store.city,
          tint: "bg-sage-soft text-secondary-foreground border-secondary/40",
        });
      }
      return { store, tags };
    });
  }, [stores]);

  return (
    <div className="min-h-screen bg-background">
      <main className="container py-6 sm:py-8 space-y-6">
        {/* Page heading */}
        <header className="space-y-2">
          <p className="page-eyebrow">Ahorrar</p>
          <h1 className="font-serif text-3xl sm:text-4xl text-foreground">Tiendas</h1>
          <p className="text-muted-foreground max-w-2xl">
            Los lugares donde Costa Rica hace su lista.
          </p>
        </header>

        {/* Search + radius card */}
        <Card className="rounded-3xl border border-border shadow-paper bg-card">
          <CardContent className="p-4 sm:p-5 space-y-4">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar tienda…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-12 h-12 rounded-xl text-base bg-paper-deep border-border focus-visible:ring-primary"
                aria-label="Buscar tiendas por nombre o cadena"
              />
            </div>
            {searchQuery.length === 0 && (
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <span className="font-serif text-sm flex items-center gap-2">
                    <Navigation className="w-4 h-4 text-primary" />
                    Radio de búsqueda
                  </span>
                  <span className="font-mono text-sm tabular-nums font-semibold">
                    {radius[0]} km
                  </span>
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
          </CardContent>
        </Card>

        {/* Store grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : storesWithTags.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {storesWithTags.map(({ store, tags }) => (
              <Card
                key={(store as { placeId?: string }).placeId ?? String(store.id)}
                className="rounded-3xl border border-border shadow-paper bg-card overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-paper-lg"
              >
                <CardContent className="p-5 space-y-4">
                  {/* Top: logo + name + rating */}
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center font-serif text-xl font-semibold shrink-0 ${tintFor(
                        store.chainId ?? (store as { placeId?: string }).placeId ?? store.id
                      )}`}
                      aria-hidden="true"
                    >
                      {initialOf(store.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-serif text-xl text-foreground leading-tight truncate">
                        {store.name}
                      </h2>
                      {store.chainId && (
                        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-serif italic capitalize truncate">
                          {String(store.chainId).replace(/[-_]/g, " ")}
                        </p>
                      )}
                    </div>
                    {store.avgRating != null && store.avgRating > 0 && (
                      <div className="flex items-center gap-1 text-sm shrink-0">
                        <Star className="w-4 h-4 fill-butter text-butter" />
                        <span className="font-mono tabular-nums font-semibold">
                          {store.avgRating.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Middle: address + distance */}
                  <div className="space-y-1.5 text-sm">
                    {store.address && (
                      <div className="flex items-start gap-2 text-muted-foreground">
                        <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-primary/70" />
                        <span className="line-clamp-2">
                          {store.address}
                          {store.city ? `, ${store.city}` : ""}
                        </span>
                      </div>
                    )}
                    {"distanceKm" in store && (
                      <div className="flex items-center gap-2 font-mono tabular-nums">
                        <Navigation className="w-4 h-4 text-primary" />
                        <span className="font-semibold">
                          {(store.distanceKm as number).toFixed(1)} km
                        </span>
                        <span className="text-muted-foreground font-sans">de tu casa</span>
                      </div>
                    )}
                  </div>

                  {/* Tag chips */}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {tags.map((tag, i) => (
                        <Badge
                          key={`${tag.label}-${i}`}
                          variant="outline"
                          className={`rounded-full border ${tag.tint} font-sans capitalize`}
                        >
                          {tag.label}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {/* Bottom: actions */}
                  <div className="flex gap-2 pt-1">
                    <Link href={`/map?store=${store.id}`} className="flex-1">
                      <Button
                        variant="outline"
                        className="w-full rounded-full min-h-11 border-border hover:bg-paper-deep"
                      >
                        <MapPin className="w-4 h-4 mr-1.5" />
                        En el mapa
                      </Button>
                    </Link>
                    <Button
                      // TODO: route to store detail when /stores/:id exists.
                      onClick={() => {
                        track(ANALYTICS_EVENTS.STORE_VIEWED, {
                          storeId: store.id,
                          chainId: store.chainId ?? undefined,
                          source: "stores",
                        });
                        toast("Pronto vas a ver el detalle de esta tienda");
                      }}
                      className="flex-1 rounded-full min-h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                    >
                      Ver tienda
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <EmptyStoresState
            isSearching={searchQuery.length > 0}
            onRequestArea={() =>
              // TODO: open an "agregá tu zona" sheet wired to user profile.
              toast.success("Anotada tu zona — la añadimos en el próximo barrido")
            }
          />
        )}
      </main>
    </div>
  );
}

function EmptyStoresState({
  isSearching,
  onRequestArea,
}: {
  isSearching: boolean;
  onRequestArea: () => void;
}) {
  return (
    <Card className="rounded-3xl border border-dashed border-border bg-card/60 shadow-paper">
      <CardContent className="py-12 px-6 text-center space-y-4">
        <div className="mx-auto w-16 h-16 rounded-full bg-paper-deep flex items-center justify-center">
          <StoreIcon className="w-7 h-7 text-primary" />
        </div>
        <div className="space-y-1.5">
          <h3 className="font-serif text-2xl text-foreground">
            {isSearching ? "Nada por aquí" : "Aún no encontramos tiendas en tu área"}
          </h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            {isSearching
              ? "Probá con otro nombre — o ampliá el radio."
              : "Agregá tu zona para que la busquemos en el próximo barrido."}
          </p>
        </div>
        {!isSearching && (
          <Button
            onClick={onRequestArea}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 min-h-11"
          >
            Agregar mi zona
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
