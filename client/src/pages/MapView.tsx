import { useState, useEffect, useCallback, useMemo } from "react";
import type { MapMarker } from "@/components/Map";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import {
  MapPin, Store, Navigation, Star,
  X, Users, Search, Plus, AlertCircle,
} from "lucide-react";
import { Link, useSearch, useLocation } from "wouter";
import { toast } from "sonner";
import { useAnalytics } from "@/hooks/useAnalytics";
import { ANALYTICS_EVENTS } from "../../../shared/analytics";

interface StoreMarker {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  avgRating?: number;
  distanceKm?: number;
  placeId?: string;
}

interface GooglePlace {
  placeId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  rating?: number;
  userRatingsTotal?: number;
  openNow?: boolean;
}

// Category chip definitions — chips are filters by chain/category keyword.
// We match against `store.chainId` or `store.name` (case-insensitive contains).
const STORE_CATEGORY_CHIPS: { id: string; label: string; match?: string[] }[] = [
  { id: "all", label: "Todas" },
  { id: "supermercado", label: "Supermercado", match: ["supermercado", "super"] },
  { id: "mini-super", label: "Mini-súper", match: ["mini"] },
  { id: "mercado", label: "Mercado", match: ["mercado", "feria"] },
  { id: "pricesmart", label: "PriceSmart", match: ["pricesmart"] },
  { id: "walmart", label: "Walmart", match: ["walmart"] },
  { id: "mas-x-menos", label: "Más x Menos", match: ["más x menos", "mas x menos"] },
  { id: "automercado", label: "AutoMercado", match: ["automercado", "auto mercado"] },
  { id: "perimercados", label: "Perimercados", match: ["perimercados", "perimercado"] },
];

export default function MapPage() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const searchParams = new URLSearchParams(useSearch());
  const highlightStoreId = searchParams.get("store");
  const highlightStoreIdsParam = searchParams.get("stores");
  const highlightStoreIds = highlightStoreIdsParam
    ? highlightStoreIdsParam.split(",").map((id) => parseInt(id)).filter((n) => !isNaN(n))
    : [];

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState([10]);
  const [selectedStore, setSelectedStore] = useState<StoreMarker | null>(null);
  const [selectedGooglePlace, setSelectedGooglePlace] = useState<GooglePlace | null>(null);
  const { track } = useAnalytics();

  // Fire `store_viewed` once per selection (any selection method — pin click,
  // highlight from URL, side panel). Skips re-fires when the same store is
  // re-selected within the same session.
  useEffect(() => {
    if (!selectedStore?.id) return;
    track(ANALYTICS_EVENTS.STORE_VIEWED, {
      storeId: selectedStore.id,
      source: "map",
    });
  }, [selectedStore?.id, track]);
  // Map state now declarative — markers computed via useMemo below.
  const [showGooglePlaces, setShowGooglePlaces] = useState(true);
  const [activeChip, setActiveChip] = useState<string>("all");
  const [crowdednessDialogOpen, setCrowdednessDialogOpen] = useState(false);
  const [crowdednessLevel, setCrowdednessLevel] = useState([50]);
  const [waitTime, setWaitTime] = useState("");
  const [crowdednessComment, setCrowdednessComment] = useState("");

  // Fetch nearby stores from our database
  const { data: nearbyStores, isLoading } = trpc.stores.getNearby.useQuery(
    {
      latitude: userLocation?.lat || 0,
      longitude: userLocation?.lng || 0,
      radiusKm: radius[0],
    },
    { enabled: !!userLocation }
  );

  // Fetch nearby stores from Google Places
  const { data: googlePlaces } = trpc.googlePlaces.searchNearby.useQuery(
    {
      latitude: userLocation?.lat || 0,
      longitude: userLocation?.lng || 0,
      radiusMeters: radius[0] * 1000,
    },
    { enabled: !!userLocation && showGooglePlaces }
  );

  // Fetch crowdedness for selected store
  const { data: crowdednessData } = trpc.crowdedness.getCurrent.useQuery(
    { storeId: selectedStore?.id || 0 },
    { enabled: !!selectedStore?.id }
  );

  // Import Google Place as store
  const importPlace = trpc.googlePlaces.importAsStore.useMutation({
    onSuccess: (data) => {
      toast.success("Tienda agregada a Tulistica");
      if (data.storeId) {
        setSelectedStore({
          id: data.storeId,
          name: selectedGooglePlace?.name || "",
          lat: selectedGooglePlace?.latitude || 0,
          lng: selectedGooglePlace?.longitude || 0,
          address: selectedGooglePlace?.address,
          avgRating: selectedGooglePlace?.rating,
        });
        setSelectedGooglePlace(null);
      }
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Report crowdedness
  const reportCrowdedness = trpc.crowdedness.report.useMutation({
    onSuccess: () => {
      toast.success("Gracias por reportar");
      setCrowdednessDialogOpen(false);
      setCrowdednessLevel([50]);
      setWaitTime("");
      setCrowdednessComment("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  // Get user location
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

  // (Leaflet's declarative API doesn't need an onMapReady — the map renders
  // when the component mounts, markers are pure props.)

  // Crowdedness palette stays semantic — green/sage, butter, terracotta, destructive.
  const getCrowdednessColor = (level: number) => {
    if (level < 30) return { bg: "bg-secondary", text: "text-secondary-foreground", label: "Tranquilo" };
    if (level < 50) return { bg: "bg-butter", text: "text-butter-foreground", label: "Algo lleno" };
    if (level < 75) return { bg: "bg-accent", text: "text-accent-foreground", label: "Lleno" };
    return { bg: "bg-destructive", text: "text-destructive-foreground", label: "Muy lleno" };
  };

  // Filter helpers — apply active chip to both DB stores and Google places.
  const matchesActiveChip = useCallback(
    (haystack: string) => {
      const chip = STORE_CATEGORY_CHIPS.find((c) => c.id === activeChip);
      if (!chip || chip.id === "all" || !chip.match) return true;
      const lower = haystack.toLowerCase();
      return chip.match.some((needle) => lower.includes(needle.toLowerCase()));
    },
    [activeChip]
  );

  const filteredNearbyStores = useMemo(() => {
    if (!nearbyStores) return [] as NonNullable<typeof nearbyStores>;
    return nearbyStores.filter((s) =>
      matchesActiveChip(`${s.name} ${s.chainId ?? ""}`)
    );
  }, [nearbyStores, matchesActiveChip]);

  const filteredGooglePlaces = useMemo(() => {
    if (!googlePlaces) return [] as NonNullable<typeof googlePlaces>;
    return googlePlaces.filter((p) => matchesActiveChip(p.name));
  }, [googlePlaces, matchesActiveChip]);

  // Build the marker list declaratively. The <MapView> component owns the
  // map; we just hand it data. No more imperative addListener / setMap calls.
  const mapMarkers = useMemo<MapMarker[]>(() => {
    const result: MapMarker[] = [];

    // Tulistica DB stores — terracotta pins.
    for (const store of filteredNearbyStores ?? []) {
      result.push({
        id: `tul-${store.id}`,
        lat: store.latitude,
        lng: store.longitude,
        kind: "tulistica",
        title: store.name,
        onClick: () => {
          setSelectedGooglePlace(null);
          setSelectedStore({
            id: store.id,
            name: store.name,
            lat: store.latitude,
            lng: store.longitude,
            address: store.address || undefined,
            avgRating: store.avgRating || undefined,
            distanceKm: store.distanceKm,
          });
        },
      });
    }

    // Google Places — sage pins, skipped if already in our DB.
    if (showGooglePlaces && filteredGooglePlaces) {
      const existingCoords = new Set(
        filteredNearbyStores?.map(
          (s) => `${s.latitude.toFixed(4)},${s.longitude.toFixed(4)}`
        ) ?? []
      );
      for (const place of filteredGooglePlaces) {
        const coordKey = `${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}`;
        if (existingCoords.has(coordKey)) continue;
        result.push({
          id: `gp-${place.placeId}`,
          lat: place.latitude,
          lng: place.longitude,
          kind: "google",
          title: place.name,
          onClick: () => {
            setSelectedStore(null);
            setSelectedGooglePlace(place);
          },
        });
      }
    }

    // User location — peach pin.
    if (userLocation) {
      result.push({
        id: "user-location",
        lat: userLocation.lat,
        lng: userLocation.lng,
        kind: "user",
      });
    }

    return result;
  }, [
    filteredNearbyStores,
    filteredGooglePlaces,
    userLocation,
    showGooglePlaces,
  ]);

  // When the page is opened with ?store=N (singular) or ?stores=N,M (plural,
  // e.g. from "Use this strategy" in Optimize), auto-select a store once data lands.
  useEffect(() => {
    if (!filteredNearbyStores) return;
    let targetId: number | null = null;
    if (highlightStoreId) {
      targetId = parseInt(highlightStoreId);
    } else if (highlightStoreIds.length > 0) {
      targetId = highlightStoreIds[0];
    }
    if (targetId === null || isNaN(targetId)) return;
    const target = filteredNearbyStores.find((s) => s.id === targetId);
    if (!target) return;
    setSelectedStore({
      id: target.id,
      name: target.name,
      lat: target.latitude,
      lng: target.longitude,
      address: target.address || undefined,
      avgRating: target.avgRating || undefined,
      distanceKm: target.distanceKm,
    });
  }, [highlightStoreId, highlightStoreIds, filteredNearbyStores]);

  // ID that drives flyTo() in the <MapView> component.
  const highlightedMarkerId = selectedStore
    ? `tul-${selectedStore.id}`
    : selectedGooglePlace
      ? `gp-${selectedGooglePlace.placeId}`
      : null;

  const handleReportCrowdedness = () => {
    if (!selectedStore) return;
    reportCrowdedness.mutate({
      storeId: selectedStore.id,
      crowdednessLevel: crowdednessLevel[0],
      waitTimeMinutes: waitTime ? parseInt(waitTime) : undefined,
      comment: crowdednessComment || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="container py-6 sm:py-8 space-y-5">
        {/* Page heading */}
        <header className="space-y-2">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground font-serif italic">
            Saber el precio
          </p>
          <h1 className="font-serif text-3xl sm:text-4xl text-foreground">
            Mapa de tiendas
          </h1>
          <p className="text-muted-foreground max-w-2xl">
            Las tiendas cerca de tu casa, con precios reales de hoy.
          </p>
        </header>

        {/* Filter chip row */}
        <div
          role="toolbar"
          aria-label="Filtrar tiendas por categoría"
          className="-mx-1 flex gap-2 overflow-x-auto pb-2 pt-1 px-1 snap-x scroll-px-1"
        >
          {STORE_CATEGORY_CHIPS.map((chip) => {
            const isActive = activeChip === chip.id;
            return (
              <Button
                key={chip.id}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => setActiveChip(chip.id)}
                className={`rounded-full snap-start whitespace-nowrap transition-colors duration-200 ${
                  isActive
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border-border bg-card hover:bg-paper-deep"
                }`}
              >
                {chip.label}
              </Button>
            );
          })}
          <div className="ml-auto flex items-center gap-3 pr-1">
            <Button
              variant={showGooglePlaces ? "default" : "outline"}
              size="sm"
              onClick={() => setShowGooglePlaces(!showGooglePlaces)}
              className={`rounded-full whitespace-nowrap ${
                showGooglePlaces
                  ? "bg-secondary text-secondary-foreground hover:bg-secondary/80"
                  : "border-border bg-card"
              }`}
            >
              <Search className="w-4 h-4 mr-1" />
              {showGooglePlaces ? "Ocultar Google Places" : "Mostrar Google Places"}
            </Button>
          </div>
        </div>

        {/* Radius slider */}
        <Card className="rounded-3xl border border-border shadow-paper bg-card">
          <CardContent className="p-4 sm:p-5 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 min-w-[180px]">
              <Navigation className="w-4 h-4 text-primary" />
              <span className="font-serif text-base">Radio de búsqueda</span>
            </div>
            <div className="flex-1 min-w-[180px]">
              <Slider value={radius} onValueChange={setRadius} min={1} max={50} step={1} />
            </div>
            <span className="font-mono text-sm font-semibold tabular-nums">
              {radius[0]} km
            </span>
          </CardContent>
        </Card>

        {/* Map + side panel grid */}
        <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
          {/* Map canvas */}
          <Card className="overflow-hidden rounded-3xl border border-border shadow-paper bg-card">
            <div className="relative w-full aspect-[4/5] sm:aspect-[3/2] lg:aspect-auto lg:h-[640px]">
              {userLocation ? (
                <MapView
                  className="w-full h-full"
                  center={userLocation}
                  zoom={12}
                  markers={mapMarkers}
                  highlightedMarkerId={highlightedMarkerId}
                  radiusKm={radius[0]}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-paper-deep">
                  <div className="text-center">
                    <MapPin className="w-10 h-10 mx-auto mb-3 text-muted-foreground animate-pulse" />
                    <p className="text-muted-foreground font-serif italic">
                      Buscando tu ubicación…
                    </p>
                  </div>
                </div>
              )}

              {/* Floating legend (top-left) */}
              <div className="absolute top-3 left-3 z-10 flex flex-col gap-2 max-w-[180px]">
                <Badge
                  variant="secondary"
                  className="rounded-full bg-card text-foreground border border-border shadow-paper font-sans"
                >
                  <Store className="w-3 h-3 mr-1 text-primary" />
                  {filteredNearbyStores?.length || 0} tiendas
                </Badge>
                {showGooglePlaces && filteredGooglePlaces && (
                  <Badge
                    variant="outline"
                    className="rounded-full bg-card border-border shadow-paper font-sans"
                  >
                    <MapPin className="w-3 h-3 mr-1 text-secondary-foreground" />
                    {filteredGooglePlaces.length} en Google
                  </Badge>
                )}
              </div>

              {/* Marker legend (bottom-left, small) */}
              <div className="absolute bottom-3 left-3 z-10 bg-card/95 backdrop-blur-sm rounded-2xl border border-border shadow-paper p-3 text-xs space-y-1.5 hidden sm:block">
                <p className="font-serif font-semibold mb-1.5 text-foreground">Pines</p>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-primary border-2 border-white" />
                  <span className="text-muted-foreground">En Tulistica</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-secondary border-2 border-white opacity-90" />
                  <span className="text-muted-foreground">En Google</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-3.5 h-3.5 rounded-full bg-accent border-2 border-white" />
                  <span className="text-muted-foreground">Tu casa</span>
                </div>
              </div>

              {/* Loading overlay */}
              {isLoading && (
                <div className="absolute inset-0 bg-background/60 backdrop-blur-sm flex items-center justify-center z-20">
                  <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              )}
            </div>
          </Card>

          {/* Side panel — desktop right, mobile below */}
          <aside className="lg:sticky lg:top-6 self-start space-y-4">
            {selectedStore ? (
              <SelectedStoreCard
                store={selectedStore}
                crowdednessData={crowdednessData}
                getCrowdednessColor={getCrowdednessColor}
                onClose={() => setSelectedStore(null)}
                onReportBusyness={() => setCrowdednessDialogOpen(true)}
                onSeePlan={() => navigate("/optimize")}
                isAuthenticated={isAuthenticated}
              />
            ) : selectedGooglePlace ? (
              <SelectedGooglePlaceCard
                place={selectedGooglePlace}
                onClose={() => setSelectedGooglePlace(null)}
                onImport={() =>
                  importPlace.mutate({ placeId: selectedGooglePlace.placeId })
                }
                isImporting={importPlace.isPending}
                isAuthenticated={isAuthenticated}
              />
            ) : (
              <EmptySidePanel />
            )}
          </aside>
        </div>
      </main>

      {/* Crowdedness Report Dialog */}
      <Dialog open={crowdednessDialogOpen} onOpenChange={setCrowdednessDialogOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              ¿Qué tan lleno está?
            </DialogTitle>
            <DialogDescription>
              Ayudá a tu barrio a saber si vale la pena ir a {selectedStore?.name} ahora.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="space-y-2">
              <Label className="font-serif">
                Nivel ({crowdednessLevel[0]}%)
              </Label>
              <Slider
                value={crowdednessLevel}
                onValueChange={setCrowdednessLevel}
                min={0}
                max={100}
                step={5}
              />
              <div className="flex justify-between text-xs text-muted-foreground font-serif italic pt-1">
                <span>Vacío</span>
                <span>Normal</span>
                <span>Lleno</span>
              </div>
              <Badge
                className={`${getCrowdednessColor(crowdednessLevel[0]).bg} ${
                  getCrowdednessColor(crowdednessLevel[0]).text
                } mt-2 rounded-full`}
              >
                {getCrowdednessColor(crowdednessLevel[0]).label}
              </Badge>
            </div>
            <div className="space-y-2">
              <Label className="font-serif">
                Tiempo de espera estimado (min, opcional)
              </Label>
              <input
                type="number"
                className="w-full rounded-xl border border-border bg-card px-4 py-3 text-base focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 outline-none"
                placeholder="ej. 10"
                value={waitTime}
                onChange={(e) => setWaitTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label className="font-serif">
                Comentario (opcional)
              </Label>
              <Textarea
                className="rounded-xl"
                placeholder="ej. Filas largas en cajas, parqueo lleno…"
                value={crowdednessComment}
                onChange={(e) => setCrowdednessComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setCrowdednessDialogOpen(false)}
              className="rounded-full"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleReportCrowdedness}
              disabled={reportCrowdedness.isPending}
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {reportCrowdedness.isPending ? "Enviando…" : "Enviar reporte"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ---------- Side panel sub-components ----------

interface SelectedStoreCardProps {
  store: StoreMarker;
  // crowdedness payload is permissively typed to avoid coupling to internal tRPC shape
  crowdednessData: any;
  getCrowdednessColor: (level: number) => { bg: string; text: string; label: string };
  onClose: () => void;
  onReportBusyness: () => void;
  onSeePlan: () => void;
  isAuthenticated: boolean;
}

function SelectedStoreCard({
  store,
  crowdednessData,
  getCrowdednessColor,
  onClose,
  onReportBusyness,
  onSeePlan,
  isAuthenticated,
}: SelectedStoreCardProps) {
  // TODO: wire to a hook that returns the user's active list priced at this store.
  // For now, render mocked rows that match the shape so the visual reads correctly.
  const mockedListItems = [
    { id: 1, name: "Aceite Capullo 1L", price: 2890 },
    { id: 2, name: "Arroz Tío Pelón 1kg", price: 1450 },
    { id: 3, name: "Frijoles negros Sabemás 900g", price: 1690 },
    { id: 4, name: "Leche Dos Pinos 1L", price: 1090 },
    { id: 5, name: "Tomate (kg)", price: 980 },
  ];
  const total = mockedListItems.reduce((sum, i) => sum + i.price, 0);
  const formatCRC = (n: number) =>
    new Intl.NumberFormat("es-CR", { maximumFractionDigits: 0 }).format(n);

  return (
    <Card className="rounded-3xl border border-border shadow-paper bg-card overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-2xl text-foreground leading-tight truncate">
              {store.name}
            </h2>
            <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
              {store.distanceKm !== undefined && (
                <span className="font-mono tabular-nums">
                  {store.distanceKm.toFixed(1)} km
                </span>
              )}
              {store.address && (
                <span className="truncate">{store.address}</span>
              )}
            </div>
            {store.avgRating != null && store.avgRating > 0 && (
              <div className="mt-2 flex items-center gap-1 text-sm">
                <Star className="w-4 h-4 fill-butter text-butter" />
                <span className="font-mono tabular-nums">{store.avgRating.toFixed(1)}</span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="rounded-full shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Crowdedness pill */}
        {crowdednessData && (
          <div className="rounded-2xl bg-paper-deep border border-border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-serif">
                <Users className="w-4 h-4 text-primary" />
                Cómo está ahora
              </span>
              <Badge
                className={`${getCrowdednessColor(crowdednessData.current.level).bg} ${
                  getCrowdednessColor(crowdednessData.current.level).text
                } rounded-full`}
              >
                {getCrowdednessColor(crowdednessData.current.level).label}
              </Badge>
            </div>
            <div className="h-2 w-full rounded-full bg-card overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  getCrowdednessColor(crowdednessData.current.level).bg
                }`}
                style={{ width: `${crowdednessData.current.level}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground font-serif italic">
              {crowdednessData.current.source === "user"
                ? `Reportado ${new Date(
                    crowdednessData.current.reportedAt!
                  ).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" })}`
                : "Estimado por patrones del barrio"}
            </p>
          </div>
        )}

        {/* Tu lista a este precio */}
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-serif italic">
            Tu lista en esta tienda
          </p>
          <ul className="divide-y divide-dashed divide-border">
            {mockedListItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="truncate pr-3">{item.name}</span>
                <span className="font-mono font-semibold tabular-nums">
                  ₡{formatCRC(item.price)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between pt-3 border-t border-border">
            <span className="font-serif text-sm text-muted-foreground">Total estimado</span>
            <span className="font-serif text-2xl text-primary font-semibold">
              ₡{formatCRC(total)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground italic">
            {/* TODO: wire to lists + storePriceComparison */}
            Precios estimados — se actualizan con cada reporte de la comunidad.
          </p>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <Button
            onClick={onSeePlan}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 min-h-11"
          >
            Ver plan completo
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const url = `https://www.google.com/maps/dir/?api=1&destination=${store.lat},${store.lng}`;
              window.open(url, "_blank");
            }}
            className="rounded-full min-h-11"
          >
            <Navigation className="w-4 h-4 mr-1" />
            Cómo llegar
          </Button>
          {isAuthenticated && (
            <Button
              variant="outline"
              onClick={onReportBusyness}
              className="rounded-full min-h-11 sm:col-span-2"
            >
              <Users className="w-4 h-4 mr-1" />
              Reportar qué tan lleno está
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface SelectedGooglePlaceCardProps {
  place: GooglePlace;
  onClose: () => void;
  onImport: () => void;
  isImporting: boolean;
  isAuthenticated: boolean;
}

function SelectedGooglePlaceCard({
  place,
  onClose,
  onImport,
  isImporting,
  isAuthenticated,
}: SelectedGooglePlaceCardProps) {
  return (
    <Card className="rounded-3xl border border-secondary shadow-paper bg-card overflow-hidden">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-serif text-2xl text-foreground leading-tight">
                {place.name}
              </h2>
              <Badge
                variant="outline"
                className="rounded-full bg-sage-soft text-secondary-foreground border-secondary font-sans"
              >
                Google
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {place.address}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Cerrar panel"
            className="rounded-full shrink-0"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {place.rating != null && (
            <div className="flex items-center gap-1 text-sm">
              <Star className="w-4 h-4 fill-butter text-butter" />
              <span className="font-mono tabular-nums font-semibold">
                {place.rating.toFixed(1)}
              </span>
              {place.userRatingsTotal && (
                <span className="text-muted-foreground text-xs">
                  ({place.userRatingsTotal})
                </span>
              )}
            </div>
          )}
          {place.openNow !== undefined && (
            <Badge
              className={`rounded-full ${
                place.openNow
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-paper-deep text-muted-foreground"
              }`}
            >
              {place.openNow ? "Abierto ahora" : "Cerrado"}
            </Badge>
          )}
        </div>

        <div className="rounded-2xl bg-sage-soft border border-secondary/40 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-secondary-foreground mt-0.5 shrink-0" />
            <div className="text-sm text-secondary-foreground">
              <p className="font-serif font-semibold">Aún no está en Tulistica</p>
              <p className="text-muted-foreground mt-0.5">
                Agregala para empezar a ver precios y reportes del barrio.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {isAuthenticated && (
            <Button
              onClick={onImport}
              disabled={isImporting}
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 min-h-11"
            >
              <Plus className="w-4 h-4 mr-1" />
              {isImporting ? "Agregando…" : "Agregar tienda"}
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => {
              const url = `https://www.google.com/maps/dir/?api=1&destination=${place.latitude},${place.longitude}`;
              window.open(url, "_blank");
            }}
            className="rounded-full min-h-11"
          >
            <Navigation className="w-4 h-4 mr-1" />
            Cómo llegar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptySidePanel() {
  return (
    <Card className="rounded-3xl border border-dashed border-border bg-card/60 shadow-paper">
      <CardContent className="p-6 text-center space-y-3">
        <div className="mx-auto w-14 h-14 rounded-full bg-paper-deep flex items-center justify-center">
          <MapPin className="w-6 h-6 text-primary" />
        </div>
        <h3 className="font-serif text-xl text-foreground">
          Tocá un pin
        </h3>
        <p className="text-sm text-muted-foreground">
          Mirá tu lista priced en cada tienda. El pin terracota ya está en
          Tulistica; el pin sage es de Google y se puede agregar.
        </p>
      </CardContent>
    </Card>
  );
}
