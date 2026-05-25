import { Link } from "wouter";
import { BrandLayout } from "@/components/BrandLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus } from "lucide-react";

function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary";
  const label = status === "pending" ? "Pendiente" : status === "approved" ? "Aprobada" : "Rechazada";
  return <Badge variant={variant}>{label}</Badge>;
}

export default function BrandStores() {
  const myStores = trpc.storeClaims.myStores.useQuery();
  const myClaims = trpc.storeClaims.myClaims.useQuery();

  const stores = myStores.data ?? [];
  const claims = myClaims.data ?? [];

  return (
    <BrandLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Mis tiendas</h1>
            <p className="text-sm text-muted-foreground">
              Tiendas reclamadas por tu marca y reclamaciones en trámite.
            </p>
          </div>
          <Link href="/brand/stores/claim">
            <Button>
              <Plus className="w-4 h-4 mr-1" /> Reclamar tienda
            </Button>
          </Link>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Tiendas activas</h2>
          {stores.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Aún no tenés tiendas activas. Empezá por <Link href="/brand/stores/claim" className="underline">reclamar tu primera tienda</Link>.
              </CardContent>
            </Card>
          ) : (
            stores.map(s => (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {s.address ?? "Sin dirección"}{s.city ? ` · ${s.city}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Próximamente: panel por tienda
                </CardContent>
              </Card>
            ))
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Reclamaciones</h2>
          {claims.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                No hay reclamaciones registradas.
              </CardContent>
            </Card>
          ) : (
            claims.map(c => (
              <Card key={c.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{c.store.name}</CardTitle>
                      <CardDescription>
                        {c.store.city ?? ""}
                      </CardDescription>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                </CardHeader>
                {c.reviewerNote && (
                  <CardContent className="text-sm">
                    <span className="text-muted-foreground">Nota del equipo:</span> {c.reviewerNote}
                  </CardContent>
                )}
                {c.status === "rejected" && (
                  <CardContent>
                    <Link href="/brand/stores/claim">
                      <Button variant="outline" size="sm">Volver a reclamar</Button>
                    </Link>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </section>
      </div>
    </BrandLayout>
  );
}
