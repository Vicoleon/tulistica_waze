import { useEffect, useState } from "react";
import { useBrandAuth } from "@/hooks/useBrandAuth";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { trpc } from "@/lib/trpc";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Megaphone,
  Receipt,
  Settings,
  LogOut,
  Menu,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const NAV = [
  { href: "/brand/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/brand/campaigns", label: "Campañas", icon: Megaphone },
  { href: "/brand/billing", label: "Facturación", icon: Receipt },
  { href: "/brand/settings", label: "Configuración", icon: Settings },
];

interface BrandLayoutProps {
  children: React.ReactNode;
  requireVerified?: boolean;
}

export function BrandLayout({ children, requireVerified = false }: BrandLayoutProps) {
  const { brand, loading, isAuthenticated, isVerified, refetch } = useBrandAuth();
  const [location, navigate] = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const logoutMutation = trpc.brandAuth.logout.useMutation();
  const resendMutation = trpc.brandAuth.resendVerification.useMutation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/brand/login");
    }
  }, [loading, isAuthenticated, navigate]);

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      await refetch();
      navigate("/brand/login");
    } catch {
      toast.error("No se pudo cerrar la sesión");
    }
  };

  const handleResend = async () => {
    try {
      const result = await resendMutation.mutateAsync();
      if (result.alreadyVerified) {
        toast.success("Tu correo ya está verificado");
        await refetch();
      } else {
        toast.success("Correo de verificación enviado");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar el correo");
    }
  };

  const renderNavLinks = (onNavigate?: () => void) =>
    NAV.map(item => {
      const Icon = item.icon;
      const active = location.startsWith(item.href);
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
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
    });

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex flex-col w-64 border-r bg-card">
        <Link
          href="/brand/dashboard"
          className="flex flex-col justify-center gap-1 h-16 px-6 border-b"
        >
          <BrandMark />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground pl-3.5">
            Portal de marcas
          </span>
        </Link>

        <nav className="flex-1 px-3 py-4 space-y-1">{renderNavLinks()}</nav>

        <div className="p-4 border-t space-y-3">
          <div>
            <div className="text-sm font-medium truncate">{brand?.companyName}</div>
            <div className="text-xs text-muted-foreground truncate">{brand?.email}</div>
          </div>
          <a
            href="/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" /> Ver Tulistica
          </a>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="md:hidden border-b bg-card px-2 h-14 flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Abrir menú">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 gap-0 flex flex-col">
                <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
                <div className="flex flex-col justify-center gap-1 h-16 px-6 border-b">
                  <BrandMark />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground pl-3.5">
                    Portal de marcas
                  </span>
                </div>
                <nav className="flex-1 px-3 py-4 space-y-1">
                  {renderNavLinks(() => setMobileNavOpen(false))}
                </nav>
                <div className="p-4 border-t space-y-3">
                  <div>
                    <div className="text-sm font-medium truncate">{brand?.companyName}</div>
                    <div className="text-xs text-muted-foreground truncate">{brand?.email}</div>
                  </div>
                  <a
                    href="/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Ver Tulistica
                  </a>
                </div>
              </SheetContent>
            </Sheet>
            <Link href="/brand/dashboard" className="flex items-center">
              <BrandMark />
            </Link>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </header>

        {brand && !isVerified && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                Verificá tu correo <strong>{brand.email}</strong> para publicar campañas y descargar facturas.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={handleResend}
              disabled={resendMutation.isPending}
            >
              Reenviar verificación
            </Button>
          </div>
        )}

        {requireVerified && !isVerified ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
              <h2 className="text-xl font-semibold">Verificación de correo requerida</h2>
              <p className="text-sm text-muted-foreground">
                Confirmá tu correo antes de acceder a esta página. Te enviamos un
                enlace de verificación a <strong>{brand?.email}</strong>.
              </p>
              <Button onClick={handleResend} disabled={resendMutation.isPending}>
                Reenviar correo de verificación
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-6 md:p-8">{children}</div>
        )}
      </main>
    </div>
  );
}
