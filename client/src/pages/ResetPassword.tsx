import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff } from "lucide-react";

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
  invalid?: boolean;
}

function PasswordField({ id, label, value, onChange, describedBy, invalid }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          required
          minLength={8}
          autoComplete="new-password"
          className="pr-10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const mismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirm) return;
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
      <AuthShell
        title="Enlace inválido"
        description="El enlace no tiene un token válido."
        footer={
          <Link href="/sign-in" className="text-primary hover:underline">
            Volver a iniciar sesión
          </Link>
        }
      >
        <Link href="/forgot-password">
          <Button className="w-full">Pedir un nuevo enlace</Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Nueva contraseña"
      description="Elegí una nueva contraseña para tu cuenta."
      footer={
        <Link href="/sign-in" className="text-primary hover:underline">
          Volver a iniciar sesión
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <PasswordField
          id="password"
          label="Nueva contraseña"
          value={password}
          onChange={setPassword}
        />
        <div className="space-y-2">
          <PasswordField
            id="confirm"
            label="Confirmar"
            value={confirm}
            onChange={setConfirm}
            describedBy={mismatch ? "confirm-error" : undefined}
            invalid={mismatch}
          />
          {mismatch && (
            <p id="confirm-error" className="text-xs text-destructive">
              Las contraseñas no coinciden.
            </p>
          )}
        </div>
        <Button type="submit" className="w-full" disabled={submitting || mismatch}>
          {submitting ? "Guardando..." : "Guardar contraseña"}
        </Button>
      </form>
    </AuthShell>
  );
}
