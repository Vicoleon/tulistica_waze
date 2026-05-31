import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

interface ReportPriceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: number;
  storeName: string;
  userLocation: { lat: number; lng: number } | null;
}

export function ReportPriceDialog({
  open,
  onOpenChange,
  storeId,
  storeName,
  userLocation,
}: ReportPriceDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [price, setPrice] = useState("");

  const { data: products } = trpc.products.search.useQuery(
    { query, limit: 6 },
    { enabled: query.length > 2 },
  );

  const submitPrice = trpc.prices.submit.useMutation({
    onSuccess: (res) => {
      toast.success(
        res.isVerified
          ? "¡Precio confirmado, gracias!"
          : "Precio enviado para revisión.",
      );
      onOpenChange(false);
      setQuery("");
      setSelectedProduct(null);
      setPrice("");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = () => {
    if (!selectedProduct || !price) return;
    submitPrice.mutate({
      storeId,
      productId: selectedProduct.id,
      price: parseFloat(price),
      userLatitude: userLocation?.lat,
      userLongitude: userLocation?.lng,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">
            Reportar precio
          </DialogTitle>
          <DialogDescription>{storeName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="product-search">Producto</Label>
            {selectedProduct ? (
              <div className="flex items-center justify-between rounded-xl border border-border bg-paper-deep px-3 py-2">
                <span className="text-sm">{selectedProduct.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedProduct(null)}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <>
                <Input
                  id="product-search"
                  placeholder="Buscar producto…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="rounded-xl"
                />
                {products && products.length > 0 && (
                  <ul className="max-h-40 overflow-y-auto rounded-xl border border-border divide-y divide-border">
                    {products.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm hover:bg-paper-deep"
                          onClick={() => {
                            setSelectedProduct({ id: p.id, name: p.name });
                          }}
                        >
                          {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-price">Precio (₡)</Label>
            <Input
              id="report-price"
              type="number"
              inputMode="decimal"
              placeholder="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedProduct || !price || submitPrice.isPending}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {submitPrice.isPending ? "Enviando…" : "Enviar precio"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
