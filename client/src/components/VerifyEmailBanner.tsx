import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Mail, X } from "lucide-react";
import { toast } from "sonner";

interface VerifyEmailBannerProps {
  emailVerified: boolean;
}

export function VerifyEmailBanner({ emailVerified }: VerifyEmailBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  if (emailVerified || dismissed) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo reenviar");
      toast.success("Correo de verificación enviado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-b bg-amber-50 dark:bg-amber-950/30">
      <div className="container flex items-center gap-3 py-3 text-sm">
        <Mail className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <span className="flex-1">
          Verificá tu correo para reportar precios y compartir listas.
        </span>
        <Button size="sm" variant="outline" onClick={handleResend} disabled={sending}>
          {sending ? "Enviando..." : "Reenviar correo"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar aviso"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
