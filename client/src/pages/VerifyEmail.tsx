import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, Receipt } from "lucide-react";

type State = "verifying" | "success" | "error";

export default function VerifyEmail() {
  const [, navigate] = useLocation();
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [state, setState] = useState<State>("verifying");

  useEffect(() => {
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
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-3 text-primary">
            <Receipt className="w-5 h-5" />
            <span className="font-serif text-lg">tulistica</span>
          </div>
          <CardTitle className="font-serif text-2xl">
            {state === "verifying" && "Verificando…"}
            {state === "success" && "¡Correo verificado!"}
            {state === "error" && "Enlace inválido o vencido"}
          </CardTitle>
          <CardDescription>
            {state === "success" && "Ya podés reportar precios y compartir listas."}
            {state === "error" && "Pedí un nuevo correo de verificación desde tu perfil."}
          </CardDescription>
        </CardHeader>
        <CardContent>
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
            <Link href="/dashboard">
              <Button variant="outline" className="w-full">Volver al dashboard</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
