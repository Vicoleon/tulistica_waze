import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Bell, BellOff, Plus, Trash2, TrendingDown, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/currency";

export default function PriceAlerts() {
  const { loading: authLoading, isAuthenticated } = useAuth({
    redirectOnUnauthenticated: true,
  });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [targetPrice, setTargetPrice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: alerts, isLoading, refetch } = trpc.priceAlerts.getAll.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: searchResults } = trpc.products.search.useQuery(
    { query: searchQuery, limit: 10 },
    { enabled: searchQuery.length > 2 }
  );

  const createAlert = trpc.priceAlerts.create.useMutation({
    onSuccess: () => {
      toast.success("Alerta de precio creada");
      refetch();
      setIsAddDialogOpen(false);
      setSelectedProductId(null);
      setTargetPrice("");
      setSearchQuery("");
    },
    onError: (error) => toast.error(error.message),
  });

  const updateAlert = trpc.priceAlerts.update.useMutation({
    onSuccess: () => {
      toast.success("Alerta actualizada");
      refetch();
    },
  });

  const deleteAlert = trpc.priceAlerts.delete.useMutation({
    onSuccess: () => {
      toast.success("Alerta eliminada");
      refetch();
    },
  });

  if (authLoading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const handleCreateAlert = () => {
    if (!selectedProductId || !targetPrice) {
      toast.error("Elegí un producto y un precio objetivo");
      return;
    }
    createAlert.mutate({
      productId: selectedProductId,
      targetPrice: parseFloat(targetPrice),
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <Bell className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">Alertas de precio</span>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline">Volver al tablero</Button>
          </Link>
        </div>
      </header>

      <main className="container py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <Bell className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{alerts?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Alertas activas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <TrendingDown className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {alerts?.filter(a =>
                      a.currentLowestPrice && a.currentLowestPrice <= a.targetPrice
                    ).length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Bajadas detectadas</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-full">
                  <span className="text-2xl text-blue-600">₡</span>
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {formatCurrency(
                      alerts?.reduce((sum, a) => {
                        if (a.currentLowestPrice && a.currentLowestPrice < a.targetPrice) {
                          return sum + (a.targetPrice - a.currentLowestPrice);
                        }
                        return sum;
                      }, 0) ?? 0
                    )}
                  </p>
                  <p className="text-sm text-muted-foreground">Ahorro potencial</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Tus alertas</h2>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Nueva alerta
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Crear alerta de precio</DialogTitle>
                <DialogDescription>
                  Te avisamos cuando el precio baje de tu objetivo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Buscar producto</Label>
                  <Input
                    placeholder="Ej. arroz, leche..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchResults && searchResults.length > 0 && (
                    <div className="border rounded-lg max-h-48 overflow-y-auto">
                      {searchResults.map((product) => (
                        <button
                          key={product.id}
                          className={`w-full text-left px-3 py-2 hover:bg-muted transition-colors ${
                            selectedProductId === product.id ? "bg-primary/10" : ""
                          }`}
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setSearchQuery(product.name);
                          }}
                        >
                          <p className="font-medium">{product.name}</p>
                          {product.brand && (
                            <p className="text-sm text-muted-foreground">{product.brand}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Precio objetivo (₡)</Label>
                  <Input
                    type="number"
                    step="10"
                    placeholder="Ej. 1500"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Te notificamos cuando el precio en alguna tienda baje de este monto.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleCreateAlert}
                  disabled={!selectedProductId || !targetPrice || createAlert.isPending}
                >
                  {createAlert.isPending ? "Creando..." : "Crear alerta"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : alerts && alerts.length > 0 ? (
          <div className="grid gap-4">
            {alerts.map((alert) => {
              const isPriceDropped = alert.currentLowestPrice && alert.currentLowestPrice <= alert.targetPrice;
              return (
                <Card key={alert.id} className={isPriceDropped ? "border-green-500 bg-green-50" : ""}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex gap-4">
                        {alert.productImageUrl ? (
                          <img
                            src={alert.productImageUrl}
                            alt={alert.productName || "Producto"}
                            className="w-16 h-16 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                            <span className="text-2xl text-muted-foreground">₡</span>
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold">{alert.productName}</h3>
                          {alert.productBrand && (
                            <p className="text-sm text-muted-foreground">{alert.productBrand}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2">
                            <div>
                              <p className="text-xs text-muted-foreground">Objetivo</p>
                              <p className="font-bold text-primary">
                                {formatCurrency(alert.targetPrice)}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Más bajo actual</p>
                              <p className={`font-bold ${isPriceDropped ? "text-green-600" : ""}`}>
                                {alert.currentLowestPrice
                                  ? formatCurrency(alert.currentLowestPrice)
                                  : "—"}
                              </p>
                            </div>
                            {alert.storeName && (
                              <div>
                                <p className="text-xs text-muted-foreground">En</p>
                                <p className="text-sm">{alert.storeName}</p>
                              </div>
                            )}
                          </div>
                          {isPriceDropped && (
                            <div className="mt-2 flex items-center gap-2 text-green-600">
                              <TrendingDown className="h-4 w-4" />
                              <span className="text-sm font-medium">
                                ¡Bajó! Ahorrá {formatCurrency(alert.targetPrice - (alert.currentLowestPrice || 0))}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={alert.isActive ?? true}
                            onCheckedChange={(checked) =>
                              updateAlert.mutate({ id: alert.id, isActive: checked })
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            {alert.isActive ? "Activa" : "Pausada"}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteAlert.mutate({ id: alert.id })}
                          aria-label="Eliminar alerta"
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <BellOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Aún no tenés alertas</h3>
              <p className="text-muted-foreground mb-4">
                Seguí productos para enterarte cuando bajen de precio.
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Crear mi primera alerta
              </Button>
            </CardContent>
          </Card>
        )}

        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              ¿Cómo funcionan las alertas?
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-semibold mb-2">1. Definí tu objetivo</h4>
                <p className="text-sm text-muted-foreground">
                  Elegí un producto y el precio que querés pagar. Monitoreamos todas las tiendas.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">2. La comunidad reporta</h4>
                <p className="text-sm text-muted-foreground">
                  Cada día llegan precios nuevos. Comparamos contra tu objetivo automáticamente.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">3. Te avisamos</h4>
                <p className="text-sm text-muted-foreground">
                  Cuando el precio baje de tu objetivo, recibís un aviso con la tienda y el monto.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
