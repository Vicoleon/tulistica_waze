import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { BrandLayout } from "@/components/BrandLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, MapPin } from "lucide-react";

type DialogState = { storeId: number; storeName: string } | null;

export default function BrandStoresClaim() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [searchQuery, setSearchQuery] = useState<{ query?: string; city?: string }>({});

  const searchResults = trpc.storeClaims.search.useQuery(searchQuery, {
    enabled: Object.keys(searchQuery).length > 0,
  });

  const claimMutation = trpc.storeClaims.claim.useMutation({
    onSuccess: () => {
      toast.success("Reclamación enviada");
      utils.storeClaims.myClaims.invalidate();
      utils.storeClaims.search.invalidate();
      setDialog(null);
      setJustification("");
      navigate("/brand/stores");
    },
    onError: (err) => toast.error(err.message),
  });

  const [dialog, setDialog] = useState<DialogState>(null);
  const [justification, setJustification] = useState("");

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSearchQuery({
      query: query.trim() || undefined,
      city: city.trim() || undefined,
    });
  };

  const handleConfirm = () => {
    if (!dialog) return;
    claimMutation.mutate({
      storeId: dialog.storeId,
      justification: justification.trim() || undefined,
    });
  };

  const stores = searchResults.data ?? [];

  return (
    <BrandLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reclamar tienda</h1>
            <p className="text-sm text-muted-foreground">
              Buscá tu tienda en la base de datos pública y enviá una reclamación.
            </p>
          </div>
          <Link href="/brand/stores">
            <Button variant="outline">Volver</Button>
          </Link>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Nombre de la tienda"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Ciudad (opcional)"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="sm:max-w-xs"
              />
              <Button type="submit">
                <Search className="w-4 h-4 mr-1" /> Buscar
              </Button>
            </form>
          </CardContent>
        </Card>

        <section className="space-y-3">
          {Object.keys(searchQuery).length === 0 && (
            <p className="text-sm text-muted-foreground">Ingresá un nombre o ciudad para empezar.</p>
          )}
          {searchResults.isLoading && (
            <p className="text-sm text-muted-foreground">Buscando...</p>
          )}
          {searchResults.data && stores.length === 0 && (
            <p className="text-sm text-muted-foreground">No se encontraron tiendas sin reclamar.</p>
          )}
          {stores.map(s => (
            <Card key={s.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <CardDescription className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {s.address ?? "Sin dirección"}{s.city ? ` · ${s.city}` : ""}
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setDialog({ storeId: s.id, storeName: s.name });
                      setJustification("");
                    }}
                  >
                    Reclamar
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </section>

        <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) { setDialog(null); setJustification(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reclamar {dialog?.storeName}</DialogTitle>
              <DialogDescription>
                Contanos por qué sos el dueño o el operador de esta tienda. Un super-admin revisa cada reclamación.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="justification">Justificación (opcional)</Label>
              <Textarea
                id="justification"
                rows={4}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Ej: Soy el gerente del local, mi cédula jurídica es 3-101-xxxxxx"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialog(null); setJustification(""); }}>Cancelar</Button>
              <Button onClick={handleConfirm} disabled={claimMutation.isPending}>
                {claimMutation.isPending ? "Enviando..." : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BrandLayout>
  );
}
