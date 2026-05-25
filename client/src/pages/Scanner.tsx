import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Camera, Barcode, MapPin, Check, X, AlertCircle, Sparkles, Upload, Loader2,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import Quagga from "@ericblade/quagga2";

const MAX_PHOTO_BYTES = 6_000_000; // ~6MB after base64 encoding fits in our 10MB body limit

type AiRecognition = {
  name: string;
  brand: string;
  category: string;
  barcode: string;
  confidence: "low" | "medium" | "high";
};

export default function Scanner() {
  const { user, isAuthenticated } = useAuth();
  const [scanning, setScanning] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const [price, setPrice] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [aiRecognition, setAiRecognition] = useState<AiRecognition | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<HTMLDivElement>(null);

  // First try local database, then external API
  const { data: localProduct, isLoading: loadingLocal } = trpc.products.getByBarcode.useQuery(
    { barcode: scannedBarcode || "" },
    { enabled: !!scannedBarcode }
  );

  const { data: externalLookup, isLoading: loadingExternal } = trpc.productLookup.byBarcode.useQuery(
    { barcode: scannedBarcode || "" },
    { enabled: !!scannedBarcode && !localProduct }
  );

  // Use local product if found, otherwise use external lookup result
  const aiProduct = aiRecognition
    ? {
        id: undefined as number | undefined,
        name: aiRecognition.name,
        brand: aiRecognition.brand,
        category: aiRecognition.category,
        imageUrl: photoPreview ?? undefined,
      }
    : null;
  const product = localProduct || externalLookup?.product || aiProduct;
  const loadingProduct = loadingLocal || (loadingExternal && !localProduct);
  const productSource: "local" | "external" | "ai" | "not_found" | undefined = localProduct
    ? "local"
    : externalLookup?.source === "external"
      ? "external"
      : aiRecognition
        ? "ai"
        : externalLookup?.source;

  const recognizeFromPhoto = trpc.productLookup.fromPhoto.useMutation({
    onSuccess: (data) => {
      if (!data.identified) {
        toast.warning("No pudimos identificar el producto. Probá con otra foto.");
        return;
      }
      setAiRecognition(data.recognition);
      if (data.recognition.barcode) {
        setScannedBarcode(data.recognition.barcode);
      }
      toast.success(`Reconocido: ${data.recognition.name} (${data.recognition.confidence})`);
    },
    onError: (err) => toast.error(err.message),
  });

  const { data: nearbyStores } = trpc.stores.getNearby.useQuery(
    { latitude: userLocation?.lat || 0, longitude: userLocation?.lng || 0, radiusKm: 1 },
    { enabled: !!userLocation }
  );

  const submitPrice = trpc.prices.submit.useMutation({
    onSuccess: (result) => {
      if (result.isOutlier) {
        toast.warning("Precio marcado como inusual — necesita verificación");
      } else if (result.requiresConfirmation) {
        toast.info("Precio enviado, esperando verificación de la comunidad");
      } else {
        toast.success(`Precio reportado · +${result.pointsEarned} puntos`);
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
      () => toast.error("Necesitamos tu ubicación para validar el precio")
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
          toast.error("No pudimos acceder a la cámara");
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
        toast.success(`Código detectado: ${result.codeResult.code}`);
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

  const handlePhotoFile = async (file: File) => {
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("La foto es muy grande. Reducí el tamaño y volvé a intentar.");
      return;
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    setPhotoPreview(dataUrl);
    setAiRecognition(null);
    recognizeFromPhoto.mutate({ imageDataUrl: dataUrl });
  };

  const resetScan = () => {
    setScannedBarcode(null);
    setPrice("");
    setSelectedStoreId(null);
    setPhotoPreview(null);
    setAiRecognition(null);
  };

  const handleSubmitPrice = () => {
    if (!price || !selectedStoreId) {
      toast.error("Completá precio y tienda");
      return;
    }

    if (!product || !product.id) {
      toast.error("Producto no está en nuestra base de datos. Buscalo primero o escaneá el código de barras.");
      return;
    }

    submitPrice.mutate({
      storeId: selectedStoreId!,
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
          <h1 className="text-xl font-bold">Escanear y reportar precio</h1>
        </div>
      </header>

      <main className="container py-6 max-w-lg">
        {!scannedBarcode && !aiRecognition ? (
          <Tabs defaultValue="barcode" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-4">
              <TabsTrigger value="barcode">
                <Barcode className="w-4 h-4 mr-1" /> Código
              </TabsTrigger>
              <TabsTrigger value="photo">
                <Sparkles className="w-4 h-4 mr-1" /> Foto IA
              </TabsTrigger>
              <TabsTrigger value="manual">
                <Camera className="w-4 h-4 mr-1" /> Manual
              </TabsTrigger>
            </TabsList>

            <TabsContent value="barcode">
              <Card className="overflow-hidden">
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
                {!scanning ? (
                  <CardContent className="p-8 text-center">
                    <Camera className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-medium mb-2">Escaneá el código de barras</h3>
                    <p className="text-muted-foreground mb-4">
                      Apuntá tu cámara al código del producto.
                    </p>
                    <Button onClick={startScanning} className="gap-2">
                      <Barcode className="w-4 h-4" /> Empezar a escanear
                    </Button>
                  </CardContent>
                ) : (
                  <CardContent className="p-4">
                    <Button variant="outline" onClick={stopScanning} className="w-full">
                      <X className="w-4 h-4 mr-2" /> Detener
                    </Button>
                  </CardContent>
                )}
              </Card>
            </TabsContent>

            <TabsContent value="photo">
              <Card>
                <CardContent className="p-6 space-y-4 text-center">
                  <Sparkles className="w-12 h-12 mx-auto text-accent" />
                  <div>
                    <h3 className="text-lg font-medium mb-1">Identificar con IA</h3>
                    <p className="text-sm text-muted-foreground">
                      Tomá una foto del producto. La IA detecta nombre, marca y categoría.
                    </p>
                  </div>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void handlePhotoFile(file);
                        e.target.value = "";
                      }
                    }}
                  />
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button
                      onClick={() => photoInputRef.current?.click()}
                      disabled={recognizeFromPhoto.isPending}
                      className="gap-2"
                    >
                      {recognizeFromPhoto.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Analizando...
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4" /> Tomar / Subir foto
                        </>
                      )}
                    </Button>
                  </div>
                  {photoPreview && (
                    <img
                      src={photoPreview}
                      alt="Vista previa"
                      className="mx-auto max-h-48 rounded-lg border"
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Mejor resultado: foto cercana del frente del envase con buena luz.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="manual">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Ingresá el código a mano</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <Input
                      placeholder="Número de código de barras..."
                      value={manualBarcode}
                      onChange={(e) => setManualBarcode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && manualBarcode.trim()) {
                          handleManualEntry();
                        }
                      }}
                    />
                    <Button onClick={handleManualEntry} disabled={!manualBarcode.trim()}>
                      Buscar
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        ) : (
          <>
            {/* Product Found */}
            <Card className="mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {scannedBarcode ? (
                    <>
                      <Barcode className="w-5 h-5" />
                      {scannedBarcode}
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-accent" />
                      Reconocido con IA
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingProduct ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
                  </div>
                ) : product ? (
                  <div className="space-y-4">
                    {productSource === "external" && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                        <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium text-blue-800">Producto encontrado en Open Food Facts</p>
                          <p className="text-blue-600">Lo agregamos a nuestra base de datos.</p>
                        </div>
                      </div>
                    )}
                    {productSource === "ai" && aiRecognition && (
                      <div className="bg-accent/10 border border-accent/30 rounded-lg p-3 flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-accent mt-0.5" />
                        <div className="text-sm">
                          <p className="font-medium">
                            Identificado por IA · confianza{" "}
                            <Badge variant="secondary" className="ml-1">
                              {aiRecognition.confidence}
                            </Badge>
                          </p>
                          <p className="text-muted-foreground text-xs mt-1">
                            Revisá los datos antes de reportar el precio. Si está mal, podés escanear el código.
                          </p>
                        </div>
                      </div>
                    )}
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
                      <Label>Precio (₡)</Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">₡</span>
                        <Input
                          type="number"
                          step="1"
                          placeholder="0"
                          value={price}
                          onChange={(e) => setPrice(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                    </div>

                    {/* Store Selection */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <MapPin className="w-4 h-4" /> Elegí la tienda
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
                                a {store.distanceKm.toFixed(2)} km
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="p-4 rounded-lg bg-muted text-center">
                          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                          <p className="text-sm text-muted-foreground">
                            No encontramos tiendas cerca. Activá tu ubicación e intentá de nuevo.
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Submit */}
                    <div className="flex gap-2 pt-4">
                      <Button variant="outline" onClick={resetScan} className="flex-1">
                        Cancelar
                      </Button>
                      <Button
                        onClick={handleSubmitPrice}
                        disabled={!price || !selectedStoreId || !product.id || submitPrice.isPending}
                        className="flex-1 gap-2"
                      >
                        <Check className="w-4 h-4" /> Reportar precio
                      </Button>
                    </div>
                    {!product.id && (
                      <p className="text-xs text-muted-foreground text-center">
                        Para reportar el precio necesitamos vincularlo a un producto. Escaneá el código de barras del envase.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="font-medium mb-2">Producto no encontrado</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Este código aún no está en nuestra base de datos.
                    </p>
                    <Button variant="outline" onClick={resetScan}>
                      Probar otro
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
                  <div className="text-sm text-muted-foreground">Tu confianza</div>
                  <div className="text-2xl font-bold text-primary">{user.trustScore}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-muted-foreground">Puntos totales</div>
                  <div className="text-2xl font-bold">{user.totalPoints}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                A más confianza, tus reportes se verifican más rápido.
              </p>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
