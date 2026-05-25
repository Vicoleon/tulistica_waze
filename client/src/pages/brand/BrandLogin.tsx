import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Loader2, Megaphone } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

type Mode = "login" | "signup";

interface BrandLoginProps {
  initialMode?: Mode;
}

export default function BrandLogin({ initialMode = "login" }: BrandLoginProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  // If already logged in, bounce to dashboard.
  const { data: existingBrand } = trpc.brand.me.useQuery();
  useEffect(() => {
    if (existingBrand) navigate("/brand");
  }, [existingBrand, navigate]);

  const [brandName, setBrandName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loginMutation = trpc.brand.login.useMutation({
    onSuccess: async (data) => {
      await utils.brand.me.invalidate();
      toast.success(`Bienvenida de vuelta, ${data.name}.`);
      navigate("/brand");
    },
    onError: (err) => toast.error(err.message),
  });

  const signupMutation = trpc.brand.signup.useMutation({
    onSuccess: async () => {
      await utils.brand.me.invalidate();
      toast.success("Marca creada — vamos a tu primer placement.");
      navigate("/brand/campaigns/new");
    },
    onError: (err) => toast.error(err.message),
  });

  const isPending = loginMutation.isPending || signupMutation.isPending;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (mode === "login") {
      loginMutation.mutate({ ownerEmail: email, password });
    } else {
      signupMutation.mutate({
        brandName: brandName.trim(),
        ownerEmail: email,
        password,
      });
    }
  };

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-5">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <span className="inline-flex w-10 h-10 rounded-xl bg-primary text-primary-foreground items-center justify-center">
            <Megaphone className="w-5 h-5" />
          </span>
          <div>
            <p className="font-serif text-lg font-semibold leading-tight">
              Tulistica · marcas
            </p>
            <p className="text-[11px] font-mono uppercase tracking-[0.14em] text-muted-foreground">
              portal de campañas
            </p>
          </div>
        </div>

        <Card className="rounded-3xl border bg-card shadow-paper p-8">
          <h1 className="font-serif text-3xl font-semibold tracking-tight mb-2">
            {mode === "login"
              ? "Entrá a tu portal"
              : "Llevá tu marca a 12.480 hogares"}
          </h1>
          <p className="text-muted-foreground mb-7">
            {mode === "login"
              ? "Gestioná tus campañas, mirá la performance y ajustá tu bid."
              : "Creá tu cuenta, arma el primer placement, y pagás solo por click."}
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" ? (
              <div className="space-y-1.5">
                <Label htmlFor="brandName">Nombre de la marca</Label>
                <Input
                  id="brandName"
                  value={brandName}
                  onChange={(e) => setBrandName(e.target.value)}
                  placeholder="Auto Mercado, Lizano, MaxiPalí…"
                  className="h-11 rounded-xl"
                  required
                  minLength={2}
                  maxLength={128}
                  autoFocus
                />
              </div>
            ) : null}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="vos@tu-marca.cr"
                className="h-11 rounded-xl"
                autoComplete="email"
                required
                autoFocus={mode === "login"}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={
                  mode === "signup" ? "Mínimo 8 caracteres" : "Tu contraseña"
                }
                className="h-11 rounded-xl"
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                required
                minLength={mode === "signup" ? 8 : 1}
                maxLength={120}
              />
            </div>

            <Button
              type="submit"
              size="lg"
              disabled={isPending}
              className="w-full rounded-full mt-2"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {mode === "login" ? "Entrando…" : "Creando marca…"}
                </>
              ) : (
                <>
                  {mode === "login" ? "Entrar" : "Crear cuenta"}
                  <ArrowRight className="w-4 h-4 ml-1" />
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-sm text-center text-muted-foreground">
            {mode === "login" ? (
              <>
                ¿Todavía no tenés una marca registrada?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="text-primary hover:underline font-medium"
                >
                  Creá tu cuenta
                </button>
              </>
            ) : (
              <>
                ¿Ya tenés una marca?{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-primary hover:underline font-medium"
                >
                  Entrá acá
                </button>
              </>
            )}
          </p>
        </Card>

        <p className="text-center text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground/70 mt-6">
          <Link href="/" className="hover:underline">
            ← volver a tulistica.com
          </Link>
        </p>
      </div>
    </main>
  );
}
