import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Receipt } from "lucide-react";
import { getLoginUrl } from "@/const";

type Mode = "signin" | "signup";

export default function SignIn() {
  const [mode, setMode] = useState<Mode>("signin");
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [, navigate] = useLocation();

  const returnTo = (() => {
    const raw = new URLSearchParams(window.location.search).get("returnTo") ?? "";
    // Only accept same-origin paths starting with a single "/".
    if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
    return "/dashboard";
  })();

  const oauthConfigured =
    Boolean(import.meta.env.VITE_OAUTH_PORTAL_URL) &&
    Boolean(import.meta.env.VITE_APP_ID);
  const oauthHref = getLoginUrl();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const endpoint = mode === "signin" ? "/api/auth/signin" : "/api/auth/signup";
      const body = mode === "signup"
        ? { email, password, name: name || undefined }
        : { email, password };
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      window.location.href = returnTo;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al iniciar sesión");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" aria-label="Volver al inicio">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Link href="/" className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-primary/15 text-primary grid place-items-center">
              <Receipt className="w-5 h-5" />
            </span>
            <span className="font-serif text-lg">tulistica</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-serif text-3xl">
              {mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
            </CardTitle>
            <CardDescription>
              {mode === "signin"
                ? "Ingresá para acceder a tus listas, alertas y reportes."
                : "Creá una cuenta para guardar listas y reportar precios."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {oauthConfigured && (
              <>
                <a href={oauthHref} className="block mb-4">
                  <Button size="lg" className="w-full rounded-full">
                    Continuar con Tulistica
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </a>
                <div className="relative my-6 text-center text-xs uppercase tracking-widest text-muted-foreground">
                  <span className="bg-card px-3 relative z-10">o usá tu correo</span>
                  <span className="absolute inset-x-0 top-1/2 border-t" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre (opcional)</Label>
                  <Input
                    id="name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Cómo te llamamos"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.cr"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Contraseña</Label>
                  {mode === "signin" && (
                    <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                      ¿Olvidaste tu contraseña?
                    </Link>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Procesando..." : mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? (
                <>
                  ¿No tenés cuenta?{" "}
                  <button type="button" className="text-primary hover:underline" onClick={() => setMode("signup")}>
                    Crear cuenta
                  </button>
                </>
              ) : (
                <>
                  ¿Ya tenés cuenta?{" "}
                  <button type="button" className="text-primary hover:underline" onClick={() => setMode("signin")}>
                    Iniciar sesión
                  </button>
                </>
              )}
            </div>

            <div className="mt-4 text-center text-xs text-muted-foreground">
              Al continuar aceptás los{" "}
              <Link href="/legal/terms" className="underline">Términos</Link>{" "}y la{" "}
              <Link href="/legal/privacy" className="underline">Política de Privacidad</Link>.
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
