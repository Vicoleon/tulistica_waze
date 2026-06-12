import { useEffect, useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const RESEND_COOLDOWN_SECONDS = 30;
const SEND_ERROR_FALLBACK = "No pudimos enviar el correo. Intentá de nuevo.";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const sendLink = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: SEND_ERROR_FALLBACK }));
        throw new Error(data.error ?? SEND_ERROR_FALLBACK);
      }
      setSent(true);
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : SEND_ERROR_FALLBACK);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    await sendLink();
  };

  return (
    <AuthShell
      title="Restablecer contraseña"
      description={
        sent
          ? "Si la cuenta existe, te enviamos un correo con el enlace para reiniciar."
          : "Ingresá tu correo y te mandamos un enlace."
      }
      footer={
        <Link href="/sign-in" className="text-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      {!sent ? (
        <form onSubmit={handleSubmit} className="space-y-4">
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
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? "Enviando..." : "Enviar enlace"}
          </Button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Enviamos un enlace a{" "}
            <span className="font-medium text-foreground">{email}</span>. Revisá
            también la carpeta de spam.
          </p>
          <p className="text-sm text-muted-foreground">
            ¿No te llegó?{" "}
            <button
              type="button"
              className="text-primary hover:underline disabled:text-muted-foreground disabled:no-underline disabled:cursor-not-allowed"
              onClick={sendLink}
              disabled={submitting || cooldown > 0}
            >
              {cooldown > 0 ? `Reenviar (${cooldown}s)` : submitting ? "Enviando..." : "Reenviar"}
            </button>
          </p>
        </div>
      )}
    </AuthShell>
  );
}
