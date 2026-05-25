import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Receipt } from "lucide-react";

export default function VendorApply() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const myStatus = trpc.vendorApplications.myStatus.useQuery(undefined, {
    enabled: !!user,
  });
  const submitMutation = trpc.vendorApplications.submit.useMutation();

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [description, setDescription] = useState("");
  const [desiredStoresNote, setDesiredStoresNote] = useState("");

  useEffect(() => {
    if (myStatus.data?.application?.status === "pending") {
      navigate("/vendor/application", { replace: true });
    }
  }, [myStatus.data, navigate]);

  if (loading || myStatus.isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Iniciá sesión primero</CardTitle>
            <CardDescription>
              Para aplicar como vendedor necesitás una cuenta de Tulistica verificada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/sign-in?returnTo=/vendor/apply">
              <Button className="w-full">Ir a iniciar sesión</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await submitMutation.mutateAsync({
        companyName: companyName.trim(),
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        description: description.trim() || undefined,
        desiredStoresNote: desiredStoresNote.trim() || undefined,
      });
      toast.success("Solicitud enviada");
      navigate("/vendor/application");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar");
    }
  };

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
            <CardTitle className="font-serif text-2xl">Aplicá como vendedor</CardTitle>
            <CardDescription>
              Contanos sobre tu tienda. Revisamos cada solicitud manualmente y te respondemos por correo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Nombre comercial</Label>
                <Input
                  id="companyName"
                  required
                  minLength={2}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Pulpería La Esquina"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactName">Nombre de contacto (opcional)</Label>
                <Input
                  id="contactName"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Tu nombre"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactPhone">Teléfono de contacto (opcional)</Label>
                <Input
                  id="contactPhone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+506 ..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Sobre tu tienda (opcional)</Label>
                <Textarea
                  id="description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="¿Qué vendés? ¿Hace cuánto operás?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desiredStoresNote">¿Qué tiendas querés manejar? (opcional)</Label>
                <Textarea
                  id="desiredStoresNote"
                  rows={2}
                  value={desiredStoresNote}
                  onChange={(e) => setDesiredStoresNote(e.target.value)}
                  placeholder="Ej: Walmart Liberia, Mas x Menos Heredia"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitMutation.isPending}>
                {submitMutation.isPending ? "Enviando..." : "Enviar solicitud"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
