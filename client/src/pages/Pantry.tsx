import { useRef, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Package, Plus, Bell, BellOff, AlertTriangle,
  ShoppingCart, Clock, Camera, Sparkles, Barcode, Loader2,
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const MAX_PHOTO_BYTES = 6_000_000;

export default function Pantry() {
  const { isAuthenticated } = useAuth();
  const [newItemName, setNewItemName] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: pantryItems, isLoading } = trpc.pantry.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: restockSuggestions } = trpc.pantry.getRestockSuggestions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const closeAddDialog = () => {
    setNewItemName("");
    setBarcode("");
    setPhotoPreview(null);
    setShowAddDialog(false);
  };

  const addItem = trpc.pantry.add.useMutation({
    onSuccess: () => {
      utils.pantry.getAll.invalidate();
      closeAddDialog();
      toast.success("Producto agregado a la despensa");
    },
    onError: (err) => toast.error(err.message),
  });

  // Lazy lookup by barcode — used inside the barcode tab on demand.
  const lookupBarcode = trpc.productLookup.byBarcode.useQuery(
    { barcode },
    { enabled: false }
  );

  const recognizeFromPhoto = trpc.productLookup.fromPhoto.useMutation({
    onSuccess: (data) => {
      if (!data.identified) {
        toast.warning("No pudimos identificar el producto. Probá con otra foto.");
        return;
      }
      const productId = data.product?.id;
      const customName = productId ? undefined : data.recognition.name;
      addItem.mutate({ productId, customName, quantity: 1 });
    },
    onError: (err) => toast.error(err.message),
  });

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
    recognizeFromPhoto.mutate({ imageDataUrl: dataUrl });
  };

  const handleAddByBarcode = async () => {
    const trimmed = barcode.trim();
    if (!trimmed) return;
    const { data } = await lookupBarcode.refetch();
    if (data?.source === "not_found" || !data?.product) {
      toast.error("No encontramos un producto con ese código. Probá la foto IA o agregalo a mano.");
      return;
    }
    const productId = (data.product as { id?: number }).id;
    if (!productId) {
      toast.error("El producto se encontró en una fuente externa pero no se guardó. Intentá de nuevo.");
      return;
    }
    addItem.mutate({ productId, quantity: 1 });
  };

  const updateItem = trpc.pantry.update.useMutation({
    onSuccess: () => {
      utils.pantry.getAll.invalidate();
    },
  });

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
          <h1 className="text-xl font-bold">Mi despensa</h1>
          <div className="ml-auto">
            <Dialog
              open={showAddDialog}
              onOpenChange={(open) => (open ? setShowAddDialog(true) : closeAddDialog())}
            >
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="w-4 h-4" /> Agregar
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Agregar a la despensa</DialogTitle>
                </DialogHeader>
                <Tabs defaultValue="photo" className="pt-2">
                  <TabsList className="grid grid-cols-3 w-full">
                    <TabsTrigger value="photo">
                      <Sparkles className="w-4 h-4 mr-1" /> Foto IA
                    </TabsTrigger>
                    <TabsTrigger value="barcode">
                      <Barcode className="w-4 h-4 mr-1" /> Código
                    </TabsTrigger>
                    <TabsTrigger value="manual">
                      <Plus className="w-4 h-4 mr-1" /> Manual
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="photo" className="space-y-3 pt-4">
                    <p className="text-sm text-muted-foreground">
                      Tomá una foto del envase. Identificamos el producto y, si es nuevo, lo guardamos en la base para todos.
                    </p>
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
                    <Button
                      className="w-full gap-2"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={recognizeFromPhoto.isPending || addItem.isPending}
                    >
                      {recognizeFromPhoto.isPending || addItem.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {recognizeFromPhoto.isPending ? "Analizando..." : "Guardando..."}
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4" /> Tomar / Subir foto
                        </>
                      )}
                    </Button>
                    {photoPreview && (
                      <img
                        src={photoPreview}
                        alt="Vista previa"
                        className="mx-auto max-h-40 rounded-lg border"
                      />
                    )}
                    <p className="text-xs text-muted-foreground text-center">
                      Funciona aunque el producto no tenga precio aún.
                    </p>
                  </TabsContent>

                  <TabsContent value="barcode" className="space-y-3 pt-4">
                    <p className="text-sm text-muted-foreground">
                      Ingresá el código de barras del envase. Buscamos en nuestra base y en Open Food Facts.
                    </p>
                    <Input
                      placeholder="Ej. 7441001100017"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && barcode.trim()) {
                          void handleAddByBarcode();
                        }
                      }}
                      inputMode="numeric"
                    />
                    <Button
                      className="w-full gap-2"
                      onClick={() => void handleAddByBarcode()}
                      disabled={!barcode.trim() || lookupBarcode.isFetching || addItem.isPending}
                    >
                      {lookupBarcode.isFetching || addItem.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
                        </>
                      ) : (
                        <>
                          <Barcode className="w-4 h-4" /> Buscar y agregar
                        </>
                      )}
                    </Button>
                  </TabsContent>

                  <TabsContent value="manual" className="space-y-3 pt-4">
                    <p className="text-sm text-muted-foreground">
                      Si no tenés foto ni código, escribilo a mano. No se guarda en la base hasta que alguien lo escanee.
                    </p>
                    <Input
                      placeholder="Ej. Arroz, aceite, papel higiénico..."
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newItemName.trim()) {
                          addItem.mutate({ customName: newItemName.trim() });
                        }
                      }}
                    />
                    <Button
                      className="w-full"
                      onClick={() => addItem.mutate({ customName: newItemName.trim() })}
                      disabled={!newItemName.trim() || addItem.isPending}
                    >
                      Agregar
                    </Button>
                  </TabsContent>
                </Tabs>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* Restock Suggestions */}
        {restockSuggestions && restockSuggestions.length > 0 && (
          <Card className="mb-6 border-accent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-accent-foreground">
                <AlertTriangle className="w-5 h-5" />
                Te podrías estar quedando sin esto
              </CardTitle>
              <CardDescription>
                Según tus patrones de compra, estos productos vencen pronto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {restockSuggestions.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-accent/10"
                  >
                    <div>
                      <div className="font-medium">{item.productName || item.customName}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Última compra hace {item.daysSinceLastPurchase} días
                        (usualmente cada {Math.round(item.avgDaysBetweenPurchases || 7)} días)
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1">
                      <ShoppingCart className="w-4 h-4" /> Agregar a lista
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pantry Items */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : pantryItems && pantryItems.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Productos ({pantryItems.length})</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pantryItems.map((item) => (
                <Card key={item.id} className="group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium">{item.productName || item.customName}</h3>
                        {item.productCategory && (
                          <Badge variant="secondary" className="mt-1">
                            {item.productCategory}
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() =>
                          updateItem.mutate({
                            id: item.id,
                            notifyWhenLow: !item.notifyWhenLow,
                          })
                        }
                      >
                        {item.notifyWhenLow ? (
                          <Bell className="w-4 h-4 text-primary" />
                        ) : (
                          <BellOff className="w-4 h-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>Cantidad</span>
                        <span className="font-medium text-foreground">{item.quantity}</span>
                      </div>
                      {item.lastPurchasedAt && (
                        <div className="flex items-center justify-between">
                          <span>Última compra</span>
                          <span>
                            {new Date(item.lastPurchasedAt).toLocaleDateString("es-CR")}
                          </span>
                        </div>
                      )}
                      {item.avgDaysBetweenPurchases && (
                        <div className="flex items-center justify-between">
                          <span>Ciclo promedio</span>
                          <span>{Math.round(item.avgDaysBetweenPurchases)} días</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <h3 className="text-lg font-medium mb-2">Tu despensa está vacía</h3>
            <p className="text-muted-foreground mb-4">
              Agregá productos para llevar inventario y recibir avisos cuando estés por quedarte sin algo.
            </p>
            <Button onClick={() => setShowAddDialog(true)} className="gap-1">
              <Plus className="w-4 h-4" /> Agregar primer producto
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
