import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import {
  ArrowLeft, MapPin, Store, Navigation, Star, DollarSign,
  Clock, ChevronRight, X, Users, Search, Plus, AlertCircle
} from "lucide-react";
import { Link, useSearch } from "wouter";
import { toast } from "sonner";

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

export default function MapPage() {
  const { user, isAuthenticated } = useAuth();
  const searchParams = new URLSearchParams(useSearch());
  const highlightStoreId = searchParams.get("store");

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [radius, setRadius] = useState([10]);
  const [selectedStore, setSelectedStore] = useState<StoreMarker | null>(null);
  const [selectedGooglePlace, setSelectedGooglePlace] = useState<GooglePlace | null>(null);
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [markers, setMarkers] = useState<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [showGooglePlaces, setShowGooglePlaces] = useState(true);
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
      toast.success("Store imported successfully!");
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
      toast.success("Thanks for reporting!");
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
        () => setUserLocation({ lat: 40.7128, lng: -74.006 }) // Default NYC
      );
    }
  }, [user]);

  // Handle map ready
  const handleMapReady = useCallback((map: google.maps.Map) => {
    setMapInstance(map);
  }, []);

  // Get crowdedness color
  const getCrowdednessColor = (level: number) => {
    if (level < 30) return { bg: "bg-green-500", text: "text-green-600", label: "Not Busy" };
    if (level < 50) return { bg: "bg-yellow-500", text: "text-yellow-600", label: "Somewhat Busy" };
    if (level < 75) return { bg: "bg-orange-500", text: "text-orange-600", label: "Busy" };
    return { bg: "bg-red-500", text: "text-red-600", label: "Very Busy" };
  };

  // Update markers when stores change
  useEffect(() => {
    if (!mapInstance) return;

    // Clear existing markers
    markers.forEach((marker) => (marker.map = null));
    const newMarkers: google.maps.marker.AdvancedMarkerElement[] = [];

    // Add our database stores (green markers)
    nearbyStores?.forEach((store) => {
      const markerElement = document.createElement("div");
      markerElement.innerHTML = `
        <div class="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform border-2 border-white">
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

    // Add Google Places (blue markers) - only those not already in our database
    if (showGooglePlaces && googlePlaces) {
      const existingCoords = new Set(
        nearbyStores?.map(s => `${s.latitude.toFixed(4)},${s.longitude.toFixed(4)}`) || []
      );

      googlePlaces.forEach((place) => {
        const coordKey = `${place.latitude.toFixed(4)},${place.longitude.toFixed(4)}`;
        if (existingCoords.has(coordKey)) return; // Skip if already in our DB

        const markerElement = document.createElement("div");
        markerElement.innerHTML = `
          <div class="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center shadow-lg cursor-pointer hover:scale-110 transition-transform border-2 border-white opacity-80">
            <svg class="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
          </div>
        `;

        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: mapInstance,
          position: { lat: place.latitude, lng: place.longitude },
          content: markerElement,
          title: place.name,
        });

        marker.addListener("click", () => {
          setSelectedStore(null);
          setSelectedGooglePlace(place);
        });

        newMarkers.push(marker);
      });
    }

    // Add user location marker
    if (userLocation) {
      const userMarkerElement = document.createElement("div");
      userMarkerElement.innerHTML = `
        <div class="w-6 h-6 rounded-full bg-blue-600 border-3 border-white shadow-lg flex items-center justify-center">
          <div class="w-2 h-2 rounded-full bg-white animate-pulse"></div>
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
  }, [mapInstance, nearbyStores, googlePlaces, userLocation, highlightStoreId, showGooglePlaces]);

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
            <Button
              variant={showGooglePlaces ? "default" : "outline"}
              size="sm"
              onClick={() => setShowGooglePlaces(!showGooglePlaces)}
            >
              <Search className="w-4 h-4 mr-1" />
              {showGooglePlaces ? "Hide" : "Show"} Google Places
            </Button>
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

        {/* Legend */}
        <div className="absolute top-4 left-4 z-10 space-y-2">
          <Badge variant="secondary" className="shadow-lg">
            <Store className="w-3 h-3 mr-1" />
            {nearbyStores?.length || 0} stores in database
          </Badge>
          {showGooglePlaces && googlePlaces && (
            <Badge variant="outline" className="shadow-lg bg-white">
              <MapPin className="w-3 h-3 mr-1 text-blue-500" />
              {googlePlaces.length} from Google
            </Badge>
          )}
        </div>

        {/* Marker Legend */}
        <div className="absolute top-4 right-4 z-10 bg-white rounded-lg shadow-lg p-3 text-xs">
          <p className="font-semibold mb-2">Legend</p>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-4 h-4 rounded-full bg-green-600"></div>
            <span>Our Database</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-4 h-4 rounded-full bg-blue-500 opacity-80"></div>
            <span>Google Places</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded-full bg-blue-600 border-2 border-white"></div>
            <span>Your Location</span>
          </div>
        </div>

        {/* Selected Store Panel (from our database) */}
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
                <div className="flex items-center gap-4 mb-3">
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

                {/* Crowdedness Indicator */}
                {crowdednessData && (
                  <div className="mb-4 p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        <span className="font-medium">Current Busyness</span>
                      </div>
                      <Badge className={getCrowdednessColor(crowdednessData.current.level).bg}>
                        {getCrowdednessColor(crowdednessData.current.level).label}
                      </Badge>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2.5">
                      <div
                        className={`h-2.5 rounded-full ${getCrowdednessColor(crowdednessData.current.level).bg}`}
                        style={{ width: `${crowdednessData.current.level}%` }}
                      ></div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {crowdednessData.current.source === "user" 
                        ? `Reported ${new Date(crowdednessData.current.reportedAt!).toLocaleTimeString()}`
                        : "Estimated based on typical patterns"}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedStore.lat},${selectedStore.lng}`;
                      window.open(url, "_blank");
                    }}
                  >
                    <Navigation className="w-4 h-4 mr-1" /> Directions
                  </Button>
                  {isAuthenticated && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCrowdednessDialogOpen(true)}
                    >
                      <Users className="w-4 h-4 mr-1" /> Report Busyness
                    </Button>
                  )}
                  <Link href={`/stores?id=${selectedStore.id}`}>
                    <Button size="sm">
                      View Prices <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Selected Google Place Panel */}
        {selectedGooglePlace && (
          <div className="absolute bottom-4 left-4 right-4 z-10 max-w-md mx-auto">
            <Card className="shadow-xl border-blue-200">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{selectedGooglePlace.name}</CardTitle>
                      <Badge variant="outline" className="text-blue-600 border-blue-300">
                        Google
                      </Badge>
                    </div>
                    <CardDescription>{selectedGooglePlace.address}</CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setSelectedGooglePlace(null)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-4 mb-3">
                  {selectedGooglePlace.rating && (
                    <div className="flex items-center gap-1">
                      <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                      <span className="font-medium">{selectedGooglePlace.rating.toFixed(1)}</span>
                      {selectedGooglePlace.userRatingsTotal && (
                        <span className="text-muted-foreground text-sm">
                          ({selectedGooglePlace.userRatingsTotal})
                        </span>
                      )}
                    </div>
                  )}
                  {selectedGooglePlace.openNow !== undefined && (
                    <Badge variant={selectedGooglePlace.openNow ? "default" : "secondary"}>
                      {selectedGooglePlace.openNow ? "Open Now" : "Closed"}
                    </Badge>
                  )}
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-800">Not in our database yet</p>
                      <p className="text-blue-600">
                        Import this store to start tracking prices and crowdedness.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const url = `https://www.google.com/maps/dir/?api=1&destination=${selectedGooglePlace.latitude},${selectedGooglePlace.longitude}`;
                      window.open(url, "_blank");
                    }}
                  >
                    <Navigation className="w-4 h-4 mr-1" /> Directions
                  </Button>
                  {isAuthenticated && (
                    <Button
                      size="sm"
                      onClick={() => importPlace.mutate({ placeId: selectedGooglePlace.placeId })}
                      disabled={importPlace.isPending}
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      {importPlace.isPending ? "Importing..." : "Import Store"}
                    </Button>
                  )}
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

      {/* Crowdedness Report Dialog */}
      <Dialog open={crowdednessDialogOpen} onOpenChange={setCrowdednessDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Store Busyness</DialogTitle>
            <DialogDescription>
              Help others know how busy {selectedStore?.name} is right now.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>How busy is it? ({crowdednessLevel[0]}%)</Label>
              <Slider
                value={crowdednessLevel}
                onValueChange={setCrowdednessLevel}
                min={0}
                max={100}
                step={5}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Empty</span>
                <span>Moderate</span>
                <span>Packed</span>
              </div>
              <Badge className={`${getCrowdednessColor(crowdednessLevel[0]).bg} mt-2`}>
                {getCrowdednessColor(crowdednessLevel[0]).label}
              </Badge>
            </div>
            <div className="space-y-2">
              <Label>Estimated wait time (minutes, optional)</Label>
              <input
                type="number"
                className="w-full px-3 py-2 border rounded-md"
                placeholder="e.g., 10"
                value={waitTime}
                onChange={(e) => setWaitTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Additional comments (optional)</Label>
              <Textarea
                placeholder="e.g., Long lines at checkout, parking lot full..."
                value={crowdednessComment}
                onChange={(e) => setCrowdednessComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCrowdednessDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleReportCrowdedness}
              disabled={reportCrowdedness.isPending}
            >
              {reportCrowdedness.isPending ? "Submitting..." : "Submit Report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
