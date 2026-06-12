import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Bell, BellOff, Plus, Trash2, TrendingDown, Package,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

const formatCRC = (n: number) =>
  new Intl.NumberFormat("es-CR", { maximumFractionDigits: 0 }).format(n);

export default function PriceAlerts() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
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
      toast.success("Alerta creada — te avisamos cuando baje");
      refetch();
      setIsAddDialogOpen(false);
      setSelectedProductId(null);
      setTargetPrice("");
      setSearchQuery("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateAlert = trpc.priceAlerts.update.useMutation({
    onSuccess: () => {
      toast.success("Guardado");
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteAlert = trpc.priceAlerts.delete.useMutation({
    onSuccess: () => {
      toast.success("Alerta eliminada");
      setPendingDeleteId(null);
      refetch();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-background">
        <main className="container py-16 text-center max-w-xl mx-auto space-y-5">
          <div className="mx-auto w-16 h-16 rounded-full bg-paper-deep flex items-center justify-center">
            <Bell className="w-7 h-7 text-primary" />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl text-foreground">
            Alertas de precio
          </h1>
          <p className="text-muted-foreground">
            Te avisamos cuando un producto que estás vigilando baja de precio.
            Iniciá sesión para empezar.
          </p>
          <Button
            asChild
            size="lg"
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 min-h-11"
          >
            <a href={getLoginUrl()}>Iniciar sesión</a>
          </Button>
        </main>
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

  const pendingAlert = alerts?.find((a) => a.id === pendingDeleteId) ?? null;

  return (
    <div className="min-h-screen bg-background">
      <main className="container py-6 sm:py-8 space-y-6">
        {/* Page heading */}
        <header className="space-y-2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="space-y-2">
            <p className="page-eyebrow">Seguir el precio</p>
            <h1 className="font-serif text-3xl sm:text-4xl text-foreground">
              Alertas de precio
            </h1>
            <p className="text-muted-foreground max-w-2xl">
              Te avisamos cuando un producto que estás vigilando baja de precio.
            </p>
          </div>
          <Button
            onClick={() => setIsAddDialogOpen(true)}
            className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 min-h-11 self-start sm:self-auto"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Nueva alerta
          </Button>
        </header>

        {/* Stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatTile
            icon={<Bell className="w-5 h-5" />}
            label="Vigiladas"
            value={String(alerts?.length || 0)}
            tint="bg-peach-soft text-accent-foreground"
          />
          <StatTile
            icon={<TrendingDown className="w-5 h-5" />}
            label="Bajaron de precio"
            value={String(
              alerts?.filter(
                (a) =>
                  a.currentLowestPrice &&
                  a.currentLowestPrice <= a.targetPrice
              ).length || 0
            )}
            tint="bg-sage-soft text-secondary-foreground"
          />
          <StatTile
            icon={<TrendingDown className="w-5 h-5" />}
            label="Ahorro potencial"
            value={`₡${formatCRC(
              alerts?.reduce((sum, a) => {
                if (
                  a.currentLowestPrice &&
                  a.currentLowestPrice < a.targetPrice
                ) {
                  return sum + (a.targetPrice - a.currentLowestPrice);
                }
                return sum;
              }, 0) || 0
            )}`}
            tint="bg-butter-soft text-butter-foreground"
            isPrice
          />
        </div>

        {/* Alerts list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : alerts && alerts.length > 0 ? (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const isPriceDropped =
                alert.currentLowestPrice != null &&
                alert.currentLowestPrice <= alert.targetPrice;
              return (
                <Card
                  key={alert.id}
                  className={`rounded-3xl border bg-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-paper-lg ${
                    isPriceDropped
                      ? "border-secondary/50 shadow-paper bg-sage-soft/40"
                      : "border-border shadow-paper"
                  }`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start gap-4 flex-wrap sm:flex-nowrap">
                      {alert.productImageUrl ? (
                        <img
                          src={alert.productImageUrl}
                          alt={alert.productName || "Producto"}
                          width={64}
                          height={64}
                          className="w-16 h-16 object-cover rounded-2xl bg-paper-deep shrink-0"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-paper-deep flex items-center justify-center shrink-0">
                          <Package className="w-7 h-7 text-muted-foreground" />
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <h3 className="font-serif text-xl text-foreground leading-tight">
                            {alert.productName}
                          </h3>
                          {alert.productBrand && (
                            <p className="text-sm text-muted-foreground">
                              {alert.productBrand}
                            </p>
                          )}
                        </div>

                        <div className="flex items-baseline gap-4 flex-wrap text-sm">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-serif italic">
                              Alerta cuando baje de
                            </p>
                            <p className="font-mono font-semibold tabular-nums text-primary text-lg">
                              ₡{formatCRC(alert.targetPrice)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-serif italic">
                              Más barato hoy
                            </p>
                            <p
                              className={`font-mono font-semibold tabular-nums text-lg ${
                                isPriceDropped
                                  ? "text-secondary-foreground"
                                  : "text-foreground"
                              }`}
                            >
                              {alert.currentLowestPrice != null
                                ? `₡${formatCRC(alert.currentLowestPrice)}`
                                : "—"}
                            </p>
                          </div>
                          {alert.storeName && (
                            <div>
                              <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-serif italic">
                                En
                              </p>
                              <p className="text-sm">{alert.storeName}</p>
                            </div>
                          )}
                        </div>

                        {isPriceDropped && (
                          <Badge className="rounded-full bg-secondary text-secondary-foreground font-sans">
                            <TrendingDown className="w-3 h-3 mr-1" />
                            Bajó ₡
                            {formatCRC(
                              alert.targetPrice -
                                (alert.currentLowestPrice || 0)
                            )}
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-col items-end gap-3 shrink-0">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={alert.isActive ?? true}
                            onCheckedChange={(checked) =>
                              updateAlert.mutate({
                                id: alert.id,
                                isActive: checked,
                              })
                            }
                            aria-label="Activar o pausar alerta"
                          />
                          <span className="text-xs text-muted-foreground font-serif italic">
                            {alert.isActive ? "Activa" : "Pausada"}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPendingDeleteId(alert.id)}
                          className="rounded-full text-destructive hover:bg-destructive/10 hover:text-destructive"
                          aria-label="Eliminar alerta"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="rounded-3xl border border-dashed border-border bg-card/60 shadow-paper">
            <CardContent className="py-12 px-6 text-center space-y-4 max-w-md mx-auto">
              <div className="mx-auto w-16 h-16 rounded-full bg-paper-deep flex items-center justify-center">
                <BellOff className="w-7 h-7 text-primary" />
              </div>
              <div className="space-y-1.5">
                <h3 className="font-serif text-2xl text-foreground">
                  Todavía no estás vigilando ningún precio
                </h3>
                <p className="text-muted-foreground">
                  Empezá con uno — te avisamos cuando baje.
                </p>
              </div>
              <Button
                onClick={() => setIsAddDialogOpen(true)}
                className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 min-h-11"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Crear mi primera alerta
              </Button>
            </CardContent>
          </Card>
        )}
      </main>

      {/* Create alert dialog */}
      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) {
            // Reset on close so reopening starts fresh.
            setSelectedProductId(null);
            setSearchQuery("");
            setTargetPrice("");
          }
        }}
      >
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              Nueva alerta de precio
            </DialogTitle>
            <DialogDescription>
              Te avisamos cuando este producto baje del precio que vos elijás.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label className="font-serif">Producto</Label>
              <Input
                placeholder="Buscar producto…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="rounded-xl bg-paper-deep border-border focus-visible:ring-primary"
              />
              {searchResults && searchResults.length > 0 && (
                <div className="rounded-2xl border border-border max-h-56 overflow-y-auto bg-card divide-y divide-dashed divide-border">
                  {searchResults.map((product) => {
                    const isSelected = selectedProductId === product.id;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        className={`w-full text-left px-4 py-3 transition-colors ${
                          isSelected
                            ? "bg-peach-soft"
                            : "hover:bg-paper-deep"
                        }`}
                        onClick={() => {
                          setSelectedProductId(product.id);
                          setSearchQuery(product.name);
                        }}
                      >
                        <p className="font-serif text-base leading-tight">
                          {product.name}
                        </p>
                        {product.brand && (
                          <p className="text-xs text-muted-foreground">
                            {product.brand}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="space-y-2">
              <Label className="font-serif">Precio objetivo (₡)</Label>
              <Input
                type="number"
                step="1"
                placeholder="ej. 2890"
                value={targetPrice}
                onChange={(e) => setTargetPrice(e.target.value)}
                className="rounded-xl font-mono bg-paper-deep border-border focus-visible:ring-primary"
              />
              <p className="text-xs text-muted-foreground font-serif italic">
                Te llega un aviso en cuanto algún reporte caiga por debajo de este precio.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
              className="rounded-full"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateAlert}
              disabled={
                !selectedProductId || !targetPrice || createAlert.isPending
              }
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {createAlert.isPending ? "Creando…" : "Crear alerta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog
        open={pendingDeleteId != null}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteId(null);
        }}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl">
              ¿Eliminar esta alerta?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Dejamos de vigilar{" "}
              <span className="font-serif italic">
                {pendingAlert?.productName ?? "este producto"}
              </span>
              . Podés volver a crearla cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-full">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (pendingDeleteId != null) {
                  deleteAlert.mutate({ id: pendingDeleteId });
                }
              }}
              disabled={deleteAlert.isPending}
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAlert.isPending ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- Small components ----------

function StatTile({
  icon,
  label,
  value,
  tint,
  isPrice,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tint: string;
  isPrice?: boolean;
}) {
  return (
    <Card className="rounded-3xl border border-border shadow-paper bg-card">
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tint}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p
            className={`leading-tight ${
              isPrice
                ? "font-mono font-semibold text-lg sm:text-xl tabular-nums"
                : "font-serif text-2xl sm:text-3xl text-foreground"
            }`}
          >
            {value}
          </p>
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground font-serif italic">
            {label}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
