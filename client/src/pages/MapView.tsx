import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import {
  ArrowLeft, MapPin, Store, Navigation, Star, DollarSign,
  Clock, ChevronRight, X
} from "lucide-react";
import { Link, useSearch } from "wouter";

interface StoreMarker {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address?: string;
  avgRating?: number;
  distanceKm?: number;
}

export default function MapPage() {
  const { user } = useAuth();
  const searchParams = new URLSearchParams(useSearch());
  const highlightStoreId = searchParams.get("store");

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState([10]);
  const [selectedStore, setSelectedStore] = useState<StoreMarker | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<google.maps.marker.AdvancedMarkerElement[]>([]);

  const { data: nearbyStores, isLoading } = trpc.stores.getNearby.useQuery(
    {
      latitude: userLocation?.lat || 0,
      longitude: userLocation?.lng || 0,
      radiusKm: radius[0],
    },
    { enabled: !!userLocation }
  );

  // Get user location
  useEffect(() => {
    if (user?.homeLatitude && user?.homeLongitude) {
      setUserLocation({ lat: user.homeLatitude, lng: user.homeLongitude });
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => setUserLocation({ lat: 40.7128, lng: -74.006 }) // Default NYC
      );
    }
  }, [user]);

  // Handle map ready
  const handleMapReady = useCallback((map: google.maps.Map) => {
    setMapInstance(map);
  }, []);

  // Update markers when stores change
  useEffect(() => {
    if (!mapInstance || !nearbyStores) return;

    // Clear existing markers
    markers.forEach((marker) => (marker.map = null));

    // Create new markers
    const newMarkers: google.maps.marker.AdvancedMarkerElement[] = [];

    nearbyStores.forEach((store) => {
      const markerElement = document.createElement("div");
      markerElement.className = "store-marker";
      markerElement.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-primary flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform">
          <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        </div>
      `;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map: mapInstance,
        position: { lat: store.latitude, lng: store.longitude },
        content: markerElement,
        title: store.name,
      });

      marker.addListener("click", () => {
        setSelectedStore({
          id: store.id,
          name: store.name,
          lat: store.latitude,
          lng: store.longitude,
          address: store.address || undefined,
          avgRating: store.avgRating || undefined,
          distanceKm: store.distanceKm,
        });
      });

      newMarkers.push(marker);

      // Highlight specific store if requested
      if (highlightStoreId && store.id === parseInt(highlightStoreId)) {
        setSelectedStore({
          id: store.id,
          name: store.name,
          lat: store.latitude,
          lng: store.longitude,
          address: store.address || undefined,
          avgRating: store.avgRating || undefined,
          distanceKm: store.distanceKm,
        });
        mapInstance.panTo({ lat: store.latitude, lng: store.longitude });
        mapInstance.setZoom(15);
      }
    });

    // Add user location marker
    if (userLocation) {
      const userMarkerElement = document.createElement("div");
      userMarkerElement.innerHTML = `
        <div class="w-6 h-6 rounded-full bg-blue-500 border-2 border-white shadow-lg flex items-center justify-center">
          <div class="w-2 h-2 rounded-full bg-white"></div>
        </div>
      `;

      const userMarker = new google.maps.marker.AdvancedMarkerElement({
        map: mapInstance,
        position: userLocation,
        content: userMarkerElement,
        title: "Your Location",
      });

      newMarkers.push(userMarker);
    }

    setMarkers(newMarkers);

    return () => {
      newMarkers.forEach((marker) => (marker.map = null));
    };
  }, [mapInstance, nearbyStores, userLocation, highlightStoreId]);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card z-50 flex-shrink-0">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Store Map</h1>
          <div className="ml-auto flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Radius:</span>
              <div className="w-32">
                <Slider
                  value={radius}
                  onValueChange={setRadius}
                  min={1}
                  max={50}
                  step={1}
                />
              </div>
              <span className="text-sm font-medium">{radius[0]} km</span>
            </div>
          </div>
        </div>
      </header>

      {/* Map Container */}
      <div className="flex-1 relative">
        {userLocation ? (
          <MapView
            onMapReady={handleMapReady}
            className="w-full h-full"
            initialCenter={userLocation}
            initialZoom={12}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <div className="text-center">
              <MapPin className="w-12 h-12 mx-auto mb-4 text-muted-foreground animate-pulse" />
              <p className="text-muted-foreground">Getting your location...</p>
            </div>
          </div>
        )}

        {/* Store Count Badge */}
        {nearbyStores && (
          <div className="absolute top-4 left-4 z-10">
            <Badge variant="secondary" className="shadow-lg">
              <Store className="w-3 h-3 mr-1" />
              {nearbyStores.length} stores nearby
            </Badge>
          </div>
        )}

        {/* Selected Store Panel */}
        {selectedStore && (
          <div className="absolute bottom-4 left-4 right-4 z-10 max-w-md mx-auto">
            <Card className="shadow-xl">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-lg">{selectedStore.name}</CardTitle>
                    {selectedStore.address && (
                      <CardDescription>{selectedStore.address}</CardDescription>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedStore(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-4">
                  {selectedStore.avgRating && selectedStore.avgRating > 0 && (
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{selectedStore.avgRating.toFixed(1)}</span>
                    </div>
                  )}
                  {selectedStore.distanceKm && (
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <Navigation className="w-4 h-4" />
                      <span>{selectedStore.distanceKm.toFixed(1)} km</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedStore.lat},${selectedStore.lng}`;
                      window.open(url, "_blank");
                    }}
                  >
                    <Navigation className="w-4 h-4 mr-1" /> Directions
                  </Button>
                  <Link href={`/stores?id=${selectedStore.id}`} className="flex-1">
                    <Button size="sm" className="w-full">
                      View Prices <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-20">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        )}
      </div>
    </div>
  );
}
