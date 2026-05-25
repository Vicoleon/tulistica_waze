import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Receipt } from "lucide-react";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Token inválido o expirado");
      }
      toast.success("Contraseña actualizada. Iniciá sesión de nuevo.");
      navigate("/sign-in");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Enlace inválido</CardTitle>
            <CardDescription>El enlace no tiene un token válido.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/forgot-password">
              <Button>Pedir un nuevo enlace</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/sign-in">
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
            <CardTitle className="font-serif text-2xl">Nueva contraseña</CardTitle>
            <CardDescription>Elegí una nueva contraseña para tu cuenta.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmar</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar contraseña"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
