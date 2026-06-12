import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type State = "verifying" | "success" | "error";

const TITLES: Record<State, string> = {
  verifying: "Verificando…",
  success: "¡Correo verificado!",
  error: "Enlace inválido o vencido",
};

const DESCRIPTIONS: Partial<Record<State, string>> = {
  success: "Ya podés reportar precios y compartir listas.",
  error: "El enlace ya se usó o expiró. Iniciá sesión para pedir uno nuevo.",
};

export default function VerifyEmail() {
  const [, navigate] = useLocation();
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [state, setState] = useState<State>("verifying");
  // The token is single-use: guard against React 18 StrictMode double-mount
  // consuming it twice (the second POST would always fail).
  const verificationStarted = useRef(false);

  useEffect(() => {
    if (verificationStarted.current) return;
    verificationStarted.current = true;
    if (!token) {
      setState("error");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        setState(res.ok ? "success" : "error");
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  return (
    <AuthShell title={TITLES[state]} description={DESCRIPTIONS[state]}>
      <div className="flex justify-center py-6">
        {state === "verifying" && <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />}
        {state === "success" && <CheckCircle2 className="w-10 h-10 text-primary" />}
        {state === "error" && <XCircle className="w-10 h-10 text-destructive" />}
      </div>
      {state === "success" && (
        <Button className="w-full" onClick={() => navigate("/dashboard")}>
          Ir al dashboard
        </Button>
      )}
      {state === "error" && (
        <Link href="/sign-in">
          <Button variant="outline" className="w-full">Ir a iniciar sesión</Button>
        </Link>
      )}
    </AuthShell>
  );
}
