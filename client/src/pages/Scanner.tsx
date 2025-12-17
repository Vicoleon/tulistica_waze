import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Camera, Barcode, DollarSign, MapPin, Check, X, AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import Quagga from "@ericblade/quagga2";

export default function Scanner() {
  const { user, isAuthenticated } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const [price, setPrice] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);

  const { data: product, isLoading: loadingProduct } = trpc.products.getByBarcode.useQuery(
    { barcode: scannedBarcode || "" },
    { enabled: !!scannedBarcode }
  );

  const { data: nearbyStores } = trpc.stores.getNearby.useQuery(
    { latitude: userLocation?.lat || 0, longitude: userLocation?.lng || 0, radiusKm: 1 },
    { enabled: !!userLocation }
  );

  const submitPrice = trpc.prices.submit.useMutation({
    onSuccess: (result) => {
      if (result.isVerified) {
        toast.success(`Price submitted! +${result.pointsEarned} points`);
      } else if (result.isOutlier) {
        toast.warning("Price flagged as unusual - needs verification");
      } else if (result.requiresConfirmation) {
        toast.info("Price submitted - awaiting community verification");
      } else {
        toast.success(`Price submitted! +${result.pointsEarned} points`);
      }
      setScannedBarcode(null);
      setPrice("");
      setSelectedStoreId(null);
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => toast.error("Location access needed for price verification")
    );
  }, []);

  const startScanning = () => {
    if (!scannerRef.current) return;

    setScanning(true);
    Quagga.init(
      {
        inputStream: {
          type: "LiveStream",
          target: scannerRef.current,
          constraints: {
            facingMode: "environment",
            width: { min: 640 },
            height: { min: 480 },
          },
        },
        decoder: {
          readers: [
            "ean_reader",
            "ean_8_reader",
            "upc_reader",
            "upc_e_reader",
            "code_128_reader",
          ],
        },
        locate: true,
      },
      (err) => {
        if (err) {
          toast.error("Failed to start camera");
          setScanning(false);
          return;
        }
        Quagga.start();
      }
    );

    Quagga.onDetected((result) => {
      if (result.codeResult?.code) {
        setScannedBarcode(result.codeResult.code);
        stopScanning();
        toast.success(`Barcode detected: ${result.codeResult.code}`);
      }
    });
  };

  const stopScanning = () => {
    Quagga.stop();
    setScanning(false);
  };

  const handleManualEntry = () => {
    if (manualBarcode.trim()) {
      setScannedBarcode(manualBarcode.trim());
      setManualBarcode("");
    }
  };

  const handleSubmitPrice = () => {
    if (!scannedBarcode || !price || !selectedStoreId) {
      toast.error("Please fill in all fields");
      return;
    }

    if (!product) {
      toast.error("Product not found in database");
      return;
    }

    submitPrice.mutate({
      storeId: selectedStoreId,
      productId: product.id,
      price: parseFloat(price),
      userLatitude: userLocation?.lat,
      userLongitude: userLocation?.lng,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Scan & Report Price</h1>
        </div>
      </header>

      <main className="container py-6 max-w-lg">
        {!scannedBarcode ? (
          <>
            {/* Scanner View */}
            <Card className="mb-6 overflow-hidden">
              <div
                ref={scannerRef}
                className={`relative aspect-[4/3] bg-black ${scanning ? "" : "hidden"}`}
              >
                {scanning && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-64 h-40 border-2 border-primary rounded-lg" />
                  </div>
                )}
              </div>
              {!scanning && (
                <CardContent className="p-8 text-center">
                  <Camera className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium mb-2">Scan a Barcode</h3>
                  <p className="text-muted-foreground mb-4">
                    Point your camera at a product barcode to report its price
                  </p>
                  <Button onClick={startScanning} className="gap-2">
                    <Barcode className="w-4 h-4" /> Start Scanning
                  </Button>
                </CardContent>
              )}
              {scanning && (
                <CardContent className="p-4">
                  <Button variant="outline" onClick={stopScanning} className="w-full">
                    <X className="w-4 h-4 mr-2" /> Stop Scanning
                  </Button>
                </CardContent>
              )}
            </Card>

            {/* Manual Entry */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Or Enter Manually</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter barcode number..."
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                  />
                  <Button onClick={handleManualEntry} disabled={!manualBarcode.trim()}>
                    Search
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* Product Found */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Barcode className="w-5 h-5" />
                  {scannedBarcode}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingProduct ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : product ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-20 h-20 object-cover rounded-lg"
                        />
                      ) : (
                        <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
                          <Barcode className="w-8 h-8 text-muted-foreground" />
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold">{product.name}</h3>
                        {product.brand && (
                          <p className="text-sm text-muted-foreground">{product.brand}</p>
                        )}
                        {product.category && (
                          <p className="text-sm text-muted-foreground">{product.category}</p>
                        )}
                      </div>
                    </div>

                    {/* Price Input */}
                    <div className="space-y-2">
                      <Label>Price</Label>
                      <div className="relative">
                        <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    {/* Store Selection */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> Select Store
                      </Label>
                      {nearbyStores && nearbyStores.length > 0 ? (
                        <div className="space-y-2">
                          {nearbyStores.slice(0, 5).map((store) => (
                            <button
                              key={store.id}
                              onClick={() => setSelectedStoreId(store.id)}
                              className={`w-full p-3 rounded-lg border text-left transition-colors ${
                                selectedStoreId === store.id
                                  ? "border-primary bg-primary/10"
                                  : "hover:bg-muted"
                              }`}
                            >
                              <div className="font-medium">{store.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {store.distanceKm.toFixed(2)} km away
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 rounded-lg bg-muted text-center">
                          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            No stores found nearby. Please enable location access.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Submit */}
                    <div className="flex gap-2 pt-4">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setScannedBarcode(null);
                          setPrice("");
                          setSelectedStoreId(null);
                        }}
                        className="flex-1"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleSubmitPrice}
                        disabled={!price || !selectedStoreId || submitPrice.isPending}
                        className="flex-1 gap-2"
                      >
                        <Check className="w-4 h-4" /> Submit Price
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-medium mb-2">Product Not Found</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      This barcode isn't in our database yet
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setScannedBarcode(null);
                        setManualBarcode("");
                      }}
                    >
                      Try Another
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Trust Score Info */}
        {isAuthenticated && user && (
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Your Trust Score</div>
                  <div className="text-2xl font-bold text-primary">{user.trustScore}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Total Points</div>
                  <div className="text-2xl font-bold">{user.totalPoints}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Higher trust scores mean your price reports are verified faster
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
