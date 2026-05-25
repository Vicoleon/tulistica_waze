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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Receipt, Check, X } from "lucide-react";

type DialogState = { kind: "approve" | "reject"; appId: number; companyName: string } | null;

export default function AdminVendorQueue() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const pendingQuery = trpc.vendorApplications.listPending.useQuery(undefined, {
    enabled: user?.role === "super_admin",
  });
  const approveMutation = trpc.vendorApplications.approve.useMutation({
    onSuccess: () => {
      toast.success("Aprobada");
      utils.vendorApplications.listPending.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const rejectMutation = trpc.vendorApplications.reject.useMutation({
    onSuccess: () => {
      toast.success("Rechazada");
      utils.vendorApplications.listPending.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [dialog, setDialog] = useState<DialogState>(null);
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

  const handleDecision = async () => {
    if (!dialog) return;
    const args = { id: dialog.appId, reviewerNote: note.trim() || undefined };
    if (dialog.kind === "approve") {
      await approveMutation.mutateAsync(args).catch(() => {});
    } else {
      await rejectMutation.mutateAsync(args).catch(() => {});
    }
    setDialog(null);
    setNote("");
  };

  const apps = pendingQuery.data ?? [];

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
        <div>
          <h1 className="font-serif text-3xl">Solicitudes de vendedor</h1>
          <p className="text-sm text-muted-foreground">
            {apps.length === 0 ? "No hay solicitudes pendientes." : `${apps.length} solicitud${apps.length === 1 ? "" : "es"} pendiente${apps.length === 1 ? "" : "s"}.`}
          </p>
        </div>

        <div className="space-y-4">
          {apps.map(app => (
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
                  <Button
                    size="sm"
                    onClick={() => { setDialog({ kind: "approve", appId: app.id, companyName: app.companyName }); setNote(""); }}
                  >
                    <Check className="w-4 h-4 mr-1" /> Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setDialog({ kind: "reject", appId: app.id, companyName: app.companyName }); setNote(""); }}
                  >
                    <X className="w-4 h-4 mr-1" /> Rechazar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) { setDialog(null); setNote(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {dialog?.kind === "approve" ? "Aprobar" : "Rechazar"} solicitud de {dialog?.companyName}
              </DialogTitle>
              <DialogDescription>
                {dialog?.kind === "approve"
                  ? "Se creará la marca y el aplicante recibirá un correo de confirmación."
                  : "El aplicante recibirá un correo con el motivo. Podrá volver a aplicar."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="reviewerNote">Nota (opcional)</Label>
              <Textarea
                id="reviewerNote"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={dialog?.kind === "approve" ? "Bienvenida..." : "Motivo del rechazo..."}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialog(null); setNote(""); }}>Cancelar</Button>
              <Button onClick={handleDecision} disabled={approveMutation.isPending || rejectMutation.isPending}>
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
