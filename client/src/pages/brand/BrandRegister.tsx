import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Receipt } from "lucide-react";

export default function BrandRegister() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [country, setCountry] = useState("");
  const registerMutation = trpc.brandAuth.register.useMutation();

  if (loading) {
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
            <CardTitle className="font-serif text-2xl">Necesitás una cuenta primero</CardTitle>
            <CardDescription>
              Iniciá sesión o creá tu cuenta personal, después podés registrar tu marca.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/sign-in?returnTo=/brand/register">
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
      await registerMutation.mutateAsync({
        companyName: companyName.trim(),
        contactName: contactName.trim() || undefined,
        country: country.trim() || undefined,
      });
      toast.success("Marca creada");
      navigate("/brand/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear la marca");
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
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Registrá tu marca</CardTitle>
            <CardDescription>
              Vamos a crear el espacio de tu marca en el portal de anunciantes.
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
                  placeholder="Productos La Sabana"
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
                <Label htmlFor="country">País (opcional)</Label>
                <Input
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Costa Rica"
                />
              </div>
              <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Creando..." : "Crear marca"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
