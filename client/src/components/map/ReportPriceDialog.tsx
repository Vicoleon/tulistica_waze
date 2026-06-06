import { useEffect, useState } from "react";
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
  /**
   * When provided, the dialog opens with this product already selected and the
   * product search is skipped. Used by the in-store shopping flow so reporting a
   * price for the row you're standing in front of is one tap.
   */
  presetProduct?: { id: number; name: string } | null;
}

export function ReportPriceDialog({
  open,
  onOpenChange,
  storeId,
  storeName,
  userLocation,
  presetProduct = null,
}: ReportPriceDialogProps) {
  const [query, setQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<{
    id: number;
    name: string;
  } | null>(null);
  const [price, setPrice] = useState("");

  // Preselect the product when the dialog is opened with a preset (in-store
  // flow). Reset the search query so the picker doesn't flash stale results.
  useEffect(() => {
    if (open && presetProduct) {
      setSelectedProduct(presetProduct);
      setQuery("");
    }
  }, [open, presetProduct]);

  const { data: products } = trpc.products.search.useQuery(
    { query, limit: 6 },
    { enabled: query.length > 2 && !presetProduct },
  );

  const submitPrice = trpc.prices.submit.useMutation({
    onSuccess: (res) => {
      // Base message: keep the verified-vs-pending distinction.
      const base = res.isVerified
        ? "¡Precio confirmado, gracias!"
        : "Precio enviado para revisión.";
      // Reward feedback: points earned + (optional) new-product bonus + weekly rank.
      const rewardParts = [`+${res.pointsEarned} pts`];
      if (res.isFirstForProduct) {
        rewardParts.push("¡+10 por estrenar este producto!");
      }
      if (res.weeklyRank != null) {
        rewardParts.push(`vas #${res.weeklyRank} esta semana`);
      }
      toast.success(base, { description: rewardParts.join(" · ") });

      // Surface each newly-unlocked achievement on its own.
      res.newAchievements.forEach((a) => {
        toast.success(`★ ¡Logro desbloqueado: ${a.name}!`);
      });

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

  // Clear transient state whenever the dialog closes so reopening (possibly for
  // a different preset product) always starts fresh. A preset is reapplied by
  // the open effect above.
  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setQuery("");
      setSelectedProduct(null);
      setPrice("");
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
                {!presetProduct && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedProduct(null)}
                  >
                    Cambiar
                  </Button>
                )}
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
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
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
