import { useState, useEffect, useRef } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";
import { ANALYTICS_EVENTS } from "../../../shared/analytics";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Camera, Barcode, MapPin, Check, X, AlertCircle,
  Loader2, Trophy,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import Quagga from "@ericblade/quagga2";

export default function Scanner() {
  const { user, isAuthenticated } = useAuth();
  const { track } = useAnalytics();
  const [scanning, setScanning] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState("");
  const [price, setPrice] = useState("");
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);

  const { data: localProduct, isLoading: loadingLocal } = trpc.products.getByBarcode.useQuery(
    { barcode: scannedBarcode || "" },
    { enabled: !!scannedBarcode }
  );

  // Fire `scanner_used` once per resolved barcode — wait until the DB lookup
  // settles so `foundInDb` reflects whether the product is in our own catalog.
  const lastTrackedBarcode = useRef<string | null>(null);
  useEffect(() => {
    if (!scannedBarcode || loadingLocal) return;
    if (lastTrackedBarcode.current === scannedBarcode) return;
    lastTrackedBarcode.current = scannedBarcode;
    track(ANALYTICS_EVENTS.SCANNER_USED, {
      barcode: scannedBarcode,
      foundInDb: Boolean(localProduct),
    });
  }, [scannedBarcode, loadingLocal, localProduct, track]);

  const { data: externalLookup, isLoading: loadingExternal } = trpc.productLookup.byBarcode.useQuery(
    { barcode: scannedBarcode || "" },
    { enabled: !!scannedBarcode && !localProduct }
  );

  const product = localProduct || externalLookup?.product;
  const loadingProduct = loadingLocal || (loadingExternal && !localProduct);
  const productSource = localProduct ? "local" : externalLookup?.source;

  const { data: nearbyStores } = trpc.stores.getNearby.useQuery(
    { latitude: userLocation?.lat || 0, longitude: userLocation?.lng || 0, radiusKm: 1 },
    { enabled: !!userLocation }
  );

  const { data: userStats } = trpc.user.getStats.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const submitPrice = trpc.prices.submit.useMutation({
    onSuccess: (result) => {
      if (result.isVerified) {
        toast.success(`Gracias por ayudar — sumaste ${result.pointsEarned} puntos.`);
      } else if (result.isOutlier) {
        toast.warning("El precio se ve raro — lo revisamos con la comunidad.");
      } else if (result.requiresConfirmation) {
        toast.info("Reporte enviado — falta que la comunidad lo confirme.");
      } else {
        toast.success(`Reporte enviado — sumaste ${result.pointsEarned} puntos.`);
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
      () => toast.error("Necesitamos tu ubicación para validar el precio.")
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
          toast.error("No pudimos abrir la cámara.");
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
        toast.success(`Código leído: ${result.codeResult.code}`);
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
      toast.error("Faltan datos antes de enviar.");
      return;
    }

    if (!product || !product.id) {
      toast.error("Este producto no está en nuestra base todavía.");
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

  // Recent scans — placeholder until a prices.getRecentByUser query exists.
  // TODO: wire to prices.getRecentByUser when it's added to the router.
  const recentScans: { id: number; productName: string; price: number; storeName: string; at: Date }[] = [];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/80 backdrop-blur sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" aria-label="Volver al inicio">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex flex-col leading-tight">
            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Comunidad
            </span>
            <span className="font-serif text-lg text-foreground">Escanear precios</span>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-3xl">
        <section className="mb-8">
          <h1 className="font-serif text-3xl md:text-4xl text-foreground tracking-tight">
            Escanear precios
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Estás en la tienda y el precio cambió — escaneá el código y la comunidad lo agradece.
          </p>
        </section>

        {!scannedBarcode ? (
          <>
            {/* Scanner viewport */}
            <Card className="rounded-3xl overflow-hidden shadow-paper border-border/60 mb-6">
              <div
                ref={scannerRef}
                className={`relative aspect-[4/3] bg-black ${scanning ? "" : "hidden"}`}
              >
                {scanning && (
                  <>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-72 h-44 border-2 border-accent rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
                    </div>
                    {/* Scan line animation */}
                    <div className="absolute inset-x-0 top-0 h-full pointer-events-none overflow-hidden motion-reduce:hidden">
                      <div
                        className="absolute inset-x-12 h-0.5 bg-accent/80 shadow-[0_0_12px_2px_rgba(247,191,141,0.6)] scanner-line"
                      />
                    </div>
                    <style>{`
                      @keyframes scanner-sweep {
                        0% { top: 22%; opacity: 0; }
                        15% { opacity: 1; }
                        50% { top: 72%; opacity: 1; }
                        85% { opacity: 1; }
                        100% { top: 22%; opacity: 0; }
                      }
                      .scanner-line {
                        animation: scanner-sweep 2.4s ease-in-out infinite;
                      }
                      @media (prefers-reduced-motion: reduce) {
                        .scanner-line { animation: none; top: 50%; }
                      }
                    `}</style>
                  </>
                )}
              </div>
              {!scanning ? (
                <CardContent className="p-8 text-center bg-paper-deep">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Camera className="w-7 h-7 text-primary" />
                  </div>
                  <h3 className="font-serif text-xl mb-2">Apuntá al código de barras</h3>
                  <p className="text-muted-foreground mb-5 max-w-sm mx-auto">
                    Encuádralo dentro del recuadro y esperá la confirmación.
                  </p>
                  <Button
                    onClick={startScanning}
                    className="h-11 rounded-full px-5 gap-2"
                  >
                    <Barcode className="w-4 h-4" /> Empezar a escanear
                  </Button>
                </CardContent>
              ) : (
                <CardContent className="p-4 bg-paper-deep">
                  <Button
                    variant="outline"
                    onClick={stopScanning}
                    className="w-full h-11 rounded-full gap-2"
                  >
                    <X className="w-4 h-4" /> Detener
                  </Button>
                </CardContent>
              )}
            </Card>

            {/* Manual entry */}
            <Card className="rounded-3xl shadow-paper border-border/60 mb-8">
              <CardContent className="p-5 md:p-6">
                <h3 className="font-serif text-lg mb-1">¿No te lee el código?</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Escribilo a mano y lo buscamos igual.
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    placeholder="Número del código…"
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    className="rounded-xl h-12 font-mono"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && manualBarcode.trim()) handleManualEntry();
                    }}
                  />
                  <Button
                    onClick={handleManualEntry}
                    disabled={!manualBarcode.trim()}
                    className="h-12 rounded-full px-5"
                  >
                    Buscar
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          /* Product reveal + price entry */
          <Card className="rounded-3xl shadow-paper border-border/60 mb-8">
            <CardContent className="p-6 md:p-8">
              <div className="flex items-center justify-between gap-3 mb-5">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  <Barcode className="w-4 h-4" />
                  <span className="font-mono normal-case">{scannedBarcode}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-full"
                  onClick={() => {
                    setScannedBarcode(null);
                    setPrice("");
                    setSelectedStoreId(null);
                  }}
                  aria-label="Cerrar"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {loadingProduct ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : product ? (
                <div className="space-y-6">
                  {productSource === "external" && (
                    <div className="bg-sky-soft border border-sky/40 rounded-2xl p-3 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-sky-foreground mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-sky-foreground">Encontrado en Open Food Facts</p>
                        <p className="text-sky-foreground/80">Lo sumamos a nuestra base.</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-24 h-24 object-cover rounded-2xl border border-border"
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-2xl bg-paper-deep flex items-center justify-center">
                        <Barcode className="w-10 h-10 text-muted-foreground/60" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <h3 className="font-serif text-xl truncate">{product.name}</h3>
                      {product.brand && (
                        <p className="text-sm text-muted-foreground truncate">{product.brand}</p>
                      )}
                      {product.category && (
                        <p className="text-xs text-muted-foreground mt-1 uppercase tracking-wider">
                          {product.category}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm">Precio que viste</Label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">
                        ₡
                      </span>
                      <Input
                        type="number"
                        step="1"
                        inputMode="decimal"
                        placeholder="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        className="pl-9 rounded-xl h-12 font-mono text-lg"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 text-sm">
                      <MapPin className="w-4 h-4" /> ¿En qué tienda?
                    </Label>
                    {nearbyStores && nearbyStores.length > 0 ? (
                      <div className="space-y-2">
                        {nearbyStores.slice(0, 5).map((store) => {
                          const selected = selectedStoreId === store.id;
                          return (
                            <button
                              key={store.id}
                              onClick={() => setSelectedStoreId(store.id)}
                              className={`w-full p-4 rounded-2xl border text-left transition-colors min-h-11 ${
                                selected
                                  ? "border-primary bg-primary/10 text-foreground"
                                  : "border-border bg-card hover:bg-paper-deep"
                              }`}
                            >
                              <div className="font-serif text-base">{store.name}</div>
                              <div className="text-xs text-muted-foreground font-mono mt-0.5">
                                {store.distanceKm.toFixed(2)} km
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-5 rounded-2xl bg-paper-deep text-center">
                        <AlertCircle className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground">
                          No vemos tiendas cerca. Activá la ubicación para validar.
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setScannedBarcode(null);
                        setPrice("");
                        setSelectedStoreId(null);
                      }}
                      className="sm:flex-1 h-11 rounded-full"
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleSubmitPrice}
                      disabled={!price || !selectedStoreId || submitPrice.isPending}
                      className="sm:flex-1 h-11 rounded-full gap-2"
                    >
                      {submitPrice.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Enviando…
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" /> Reportar precio
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                  <h3 className="font-serif text-xl mb-2">No conocemos este producto.</h3>
                  <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
                    Probá escaneando otro o agregalo a la base más tarde.
                  </p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setScannedBarcode(null);
                      setManualBarcode("");
                    }}
                    className="rounded-full h-11"
                  >
                    Escanear otro
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Últimos escaneos */}
        <section className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="font-serif text-2xl">Últimos escaneos</h2>
            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Tu actividad
            </span>
          </div>
          <Card className="rounded-3xl shadow-paper border-border/60 overflow-hidden">
            <CardContent className="p-0">
              {recentScans.length === 0 ? (
                <div className="text-center py-10 px-6">
                  <Barcode className="w-10 h-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-muted-foreground">
                    Cuando escanées un producto, aparece acá.
                  </p>
                </div>
              ) : (
                recentScans.map((scan, idx) => (
                  <div
                    key={scan.id}
                    className={`flex items-center justify-between p-4 ${
                      idx !== recentScans.length - 1 ? "border-b border-dashed border-border" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-serif text-base truncate">{scan.productName}</div>
                      <div className="text-xs text-muted-foreground">{scan.storeName}</div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <div className="font-mono text-base text-foreground">
                        ₡{scan.price.toLocaleString("es-CR")}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {scan.at.toLocaleString("es-CR")}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        {/* Tu aporte */}
        {isAuthenticated && user && (
          <Card className="rounded-3xl border-border/60 bg-butter-soft mb-4">
            <CardContent className="p-6 md:p-7">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-butter-foreground/80">
                    Tu aporte esta semana
                  </div>
                  <h3 className="font-serif text-xl mt-1 text-butter-foreground">
                    Cada precio cuenta — todo Costa Rica te lo agradece.
                  </h3>
                </div>
                <Trophy className="w-7 h-7 text-butter-foreground/60" />
              </div>
              <div className="grid grid-cols-3 gap-4 mt-5">
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-butter-foreground/70 mb-1">
                    Reportes
                  </div>
                  <div className="font-serif text-3xl text-butter-foreground leading-none">
                    {user.priceReportsCount ?? 0}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-butter-foreground/70 mb-1">
                    Puntos
                  </div>
                  <div className="font-serif text-3xl text-butter-foreground leading-none">
                    {(user.totalPoints ?? 0).toLocaleString("es-CR")}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.14em] text-butter-foreground/70 mb-1">
                    Puesto
                  </div>
                  <div className="font-serif text-3xl text-butter-foreground leading-none">
                    #{userStats?.weeklyRank ?? "—"}
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <Link href="/leaderboard">
                  <Button
                    variant="outline"
                    className="rounded-full h-11 bg-card border-butter-foreground/20 text-butter-foreground hover:bg-butter"
                  >
                    Ver ranking
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
