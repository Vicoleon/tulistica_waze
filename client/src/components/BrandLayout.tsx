import { useAuth } from "@/_core/hooks/useAuth";
import { useBrandAuth } from "@/hooks/useBrandAuth";
import { Button } from "@/components/ui/button";
import { BrandSwitcher } from "@/components/BrandSwitcher";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Megaphone,
  Receipt,
  Settings,
  LogOut,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const NAV = [
  { href: "/brand/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/brand/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/brand/billing", label: "Billing", icon: Receipt },
  { href: "/brand/settings", label: "Settings", icon: Settings },
];

interface BrandLayoutProps {
  children: React.ReactNode;
  requireVerified?: boolean;
}

export function BrandLayout({ children, requireVerified = false }: BrandLayoutProps) {
  const { user, loading: userLoading } = useAuth();
  const { brand, memberships, loading: brandLoading } = useBrandAuth();
  const [location, navigate] = useLocation();
  const loading = userLoading || brandLoading;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    navigate("/sign-in?returnTo=" + encodeURIComponent(location));
    return null;
  }

  if (memberships.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
          <h2 className="text-xl font-semibold">No tenés acceso a una marca</h2>
          <p className="text-sm text-muted-foreground">
            Para usar el portal de marcas necesitás que te inviten o registrar tu propia marca.
          </p>
          <Link href="/brand/register">
            <Button>Registrar mi marca</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      window.location.href = "/sign-in";
    } catch {
      toast.error("Logout failed");
    }
  };

  const handleResend = async () => {
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
    }
  };

  const showVerifyBanner = !!user && !user.emailVerified;
  const blockedByVerify = requireVerified && showVerifyBanner;

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex flex-col w-64 border-r bg-card">
        <Link href="/brand/dashboard" className="flex items-center gap-2 h-16 px-6 border-b">
          <div className="w-9 h-9 rounded-full bg-primary/15 text-primary grid place-items-center">
            <Receipt className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-sm">tulistica</span>
            <span className="text-xs text-muted-foreground">Portal de marcas</span>
          </div>
        </Link>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(item => {
            const Icon = item.icon;
            const active = location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <div className="text-sm font-medium truncate">{brand?.companyName}</div>
          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-3"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="border-b bg-card px-4 md:px-6 h-14 flex items-center justify-between">
          <Link href="/brand/dashboard" className="md:hidden flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary/15 text-primary grid place-items-center">
              <Receipt className="w-4 h-4" />
            </span>
            <span className="font-serif text-sm">tulistica</span>
          </Link>
          {brand && (
            <BrandSwitcher activeBrandId={brand.id} memberships={memberships} />
          )}
          <Button variant="ghost" size="sm" className="md:hidden" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </header>

        {showVerifyBanner && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                Verificá tu correo <strong>{user.email}</strong> para publicar campañas o descargar facturas.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={handleResend}
            >
              Reenviar correo
            </Button>
          </div>
        )}

        {blockedByVerify ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
              <h2 className="text-xl font-semibold">Verificación de correo requerida</h2>
              <p className="text-sm text-muted-foreground">
                Confirmá tu correo antes de acceder a esta página. Te mandamos un enlace
                a <strong>{user.email}</strong>.
              </p>
              <Button onClick={handleResend}>Reenviar correo</Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-6 md:p-8">{children}</div>
        )}
      </main>
    </div>
  );
}
