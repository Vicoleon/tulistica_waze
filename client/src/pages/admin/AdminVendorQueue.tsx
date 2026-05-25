import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Receipt, Check, X, MapPin } from "lucide-react";

type Kind = "approve" | "reject";
type AppDialog = { kind: Kind; id: number; label: string; target: "vendorApp" | "storeClaim" } | null;

export default function AdminVendorQueue() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();

  const pendingApps = trpc.vendorApplications.listPending.useQuery(undefined, {
    enabled: user?.role === "super_admin",
  });
  const pendingClaims = trpc.storeClaims.listPending.useQuery(undefined, {
    enabled: user?.role === "super_admin",
  });

  const approveApp = trpc.vendorApplications.approve.useMutation({
    onSuccess: () => { toast.success("Solicitud aprobada"); utils.vendorApplications.listPending.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const rejectApp = trpc.vendorApplications.reject.useMutation({
    onSuccess: () => { toast.success("Solicitud rechazada"); utils.vendorApplications.listPending.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const approveClaim = trpc.storeClaims.approve.useMutation({
    onSuccess: () => { toast.success("Reclamación aprobada"); utils.storeClaims.listPending.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const rejectClaim = trpc.storeClaims.reject.useMutation({
    onSuccess: () => { toast.success("Reclamación rechazada"); utils.storeClaims.listPending.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const [dialog, setDialog] = useState<AppDialog>(null);
  const [note, setNote] = useState("");

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </main>
    );
  }

  if (!user || user.role !== "super_admin") {
    navigate("/dashboard", { replace: true });
    return null;
  }

  const apps = pendingApps.data ?? [];
  const claims = pendingClaims.data ?? [];

  const handleConfirm = async () => {
    if (!dialog) return;
    const args = { id: dialog.id, reviewerNote: note.trim() || undefined };
    if (dialog.target === "vendorApp") {
      if (dialog.kind === "approve") await approveApp.mutateAsync(args).catch(() => {});
      else await rejectApp.mutateAsync(args).catch(() => {});
    } else {
      if (dialog.kind === "approve") await approveClaim.mutateAsync(args).catch(() => {});
      else await rejectClaim.mutateAsync(args).catch(() => {});
    }
    setDialog(null);
    setNote("");
  };

  const defaultTab = apps.length > 0 || claims.length === 0 ? "applications" : "claims";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" aria-label="Volver">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <span className="font-serif text-lg flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-primary/15 text-primary grid place-items-center">
              <Receipt className="w-5 h-5" />
            </span>
            tulistica · admin
          </span>
        </div>
      </header>

      <main className="flex-1 container py-8 space-y-6 max-w-4xl">
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="applications">
              Solicitudes de vendedor
              {apps.length > 0 && <Badge variant="secondary" className="ml-2">{apps.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="claims">
              Reclamaciones de tienda
              {claims.length > 0 && <Badge variant="secondary" className="ml-2">{claims.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="applications" className="space-y-4 pt-4">
            {apps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
            ) : (
              apps.map(app => (
                <Card key={app.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>{app.companyName}</CardTitle>
                        <CardDescription>
                          Aplicante #{app.applicantUserId}
                          {app.contactName ? ` · ${app.contactName}` : ""}
                          {app.contactPhone ? ` · ${app.contactPhone}` : ""}
                        </CardDescription>
                      </div>
                      <Badge variant="outline">{app.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {app.description && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Sobre la tienda:</span> {app.description}
                      </div>
                    )}
                    {app.desiredStoresNote && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Tiendas:</span> {app.desiredStoresNote}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => { setDialog({ kind: "approve", id: app.id, label: app.companyName, target: "vendorApp" }); setNote(""); }}>
                        <Check className="w-4 h-4 mr-1" /> Aprobar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setDialog({ kind: "reject", id: app.id, label: app.companyName, target: "vendorApp" }); setNote(""); }}>
                        <X className="w-4 h-4 mr-1" /> Rechazar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="claims" className="space-y-4 pt-4">
            {claims.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay reclamaciones pendientes.</p>
            ) : (
              claims.map(c => (
                <Card key={c.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{c.store.name}</CardTitle>
                        <CardDescription className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {c.store.address ?? "Sin dirección"}{c.store.city ? ` · ${c.store.city}` : ""}
                        </CardDescription>
                        <div className="text-xs text-muted-foreground mt-1">
                          Marca: <span className="font-medium">{c.brand.companyName}</span> · Aplicante #{c.claimantUserId}
                        </div>
                      </div>
                      <Badge variant="outline">{c.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {c.justification && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Justificación:</span> {c.justification}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => { setDialog({ kind: "approve", id: c.id, label: c.store.name, target: "storeClaim" }); setNote(""); }}>
                        <Check className="w-4 h-4 mr-1" /> Aprobar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setDialog({ kind: "reject", id: c.id, label: c.store.name, target: "storeClaim" }); setNote(""); }}>
                        <X className="w-4 h-4 mr-1" /> Rechazar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) { setDialog(null); setNote(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {dialog?.kind === "approve" ? "Aprobar" : "Rechazar"} {dialog?.target === "vendorApp" ? "solicitud" : "reclamación"} de {dialog?.label}
              </DialogTitle>
              <DialogDescription>
                {dialog?.kind === "approve" ? "El aplicante recibirá un correo de confirmación." : "El aplicante recibirá un correo con el motivo."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="reviewerNote">Nota (opcional)</Label>
              <Textarea
                id="reviewerNote"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialog(null); setNote(""); }}>Cancelar</Button>
              <Button onClick={handleConfirm}>Confirmar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
