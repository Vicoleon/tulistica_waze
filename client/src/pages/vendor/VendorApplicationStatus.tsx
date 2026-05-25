import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Receipt, CheckCircle2, XCircle, Clock } from "lucide-react";

function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

export default function VendorApplicationStatus() {
  const [, navigate] = useLocation();
  const { user, loading: userLoading } = useAuth();
  const myStatus = trpc.vendorApplications.myStatus.useQuery(undefined, {
    enabled: !!user,
  });

  if (userLoading || myStatus.isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </main>
    );
  }

  if (!user) {
    navigate("/sign-in?returnTo=/vendor/application", { replace: true });
    return null;
  }

  const app = myStatus.data?.application ?? null;

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
            tulistica
          </span>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Tu solicitud de vendedor</CardTitle>
            <CardDescription>
              {app ? `Enviada ${timeAgo(app.createdAt)}` : "Todavía no aplicaste."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!app && (
              <Link href="/vendor/apply">
                <Button className="w-full">Aplicar ahora</Button>
              </Link>
            )}

            {app?.status === "pending" && (
              <>
                <div className="flex items-center gap-3 rounded-lg border bg-amber-50 dark:bg-amber-950/30 p-4">
                  <Clock className="w-5 h-5 text-amber-700 dark:text-amber-300" />
                  <div>
                    <div className="font-medium">Estamos revisando tu solicitud</div>
                    <div className="text-sm text-muted-foreground">Te avisamos por correo cuando haya respuesta.</div>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div><span className="text-muted-foreground">Marca:</span> <span className="font-medium">{app.companyName}</span></div>
                  {app.contactName && <div><span className="text-muted-foreground">Contacto:</span> {app.contactName}</div>}
                  {app.contactPhone && <div><span className="text-muted-foreground">Teléfono:</span> {app.contactPhone}</div>}
                  {app.description && <div><span className="text-muted-foreground">Descripción:</span> {app.description}</div>}
                  {app.desiredStoresNote && <div><span className="text-muted-foreground">Tiendas:</span> {app.desiredStoresNote}</div>}
                </div>
              </>
            )}

            {app?.status === "approved" && (
              <>
                <div className="flex items-center gap-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-4">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
                  <div>
                    <div className="font-medium">¡Tu marca fue aprobada!</div>
                    <div className="text-sm text-muted-foreground">Ya podés entrar al portal de marcas.</div>
                  </div>
                </div>
                {app.reviewerNote && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Nota del equipo:</span> {app.reviewerNote}
                  </div>
                )}
                <Link href="/brand/dashboard">
                  <Button className="w-full">Ir al portal de marcas</Button>
                </Link>
              </>
            )}

            {app?.status === "rejected" && (
              <>
                <div className="flex items-center gap-3 rounded-lg border bg-red-50 dark:bg-red-950/30 p-4">
                  <XCircle className="w-5 h-5 text-red-700 dark:text-red-300" />
                  <div>
                    <div className="font-medium">Tu solicitud no fue aprobada</div>
                    <div className="text-sm text-muted-foreground">Podés volver a aplicar cuando quieras.</div>
                  </div>
                </div>
                {app.reviewerNote && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Motivo:</span> {app.reviewerNote}
                  </div>
                )}
                <Link href="/vendor/apply">
                  <Button variant="outline" className="w-full">Volver a aplicar</Button>
                </Link>
              </>
            )}

            {app && (
              <div className="text-xs text-muted-foreground text-right">
                <Badge variant="outline">{app.status}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
