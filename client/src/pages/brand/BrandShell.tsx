import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { BarChart3, LayoutDashboard, LogOut, Megaphone } from "lucide-react";
import { ReactNode } from "react";
import { toast } from "sonner";
import { Link, useLocation } from "wouter";

/**
 * Layout shell for the brand portal. Lives outside the DashboardLayout — the
 * brand portal is a separate product with its own chrome (no shopper sidebar,
 * no breadcrumbs into the consumer app).
 */
export function BrandShell({
  children,
  showLogout = true,
}: {
  children: ReactNode;
  showLogout?: boolean;
}) {
  const [location, navigate] = useLocation();
  const { data: brand } = trpc.brand.me.useQuery();
  const utils = trpc.useUtils();
  const logoutMutation = trpc.brand.logout.useMutation({
    onSuccess: () => {
      void utils.brand.me.invalidate();
      navigate("/brand/login");
    },
  });

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      toast.success("Sesión cerrada.");
    } catch {
      toast.error("No pudimos cerrar la sesión.");
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-50">
        <div className="container flex items-center justify-between py-3 sm:py-4">
          <Link href="/brand">
            <div className="flex items-center gap-3 cursor-pointer">
              <span className="inline-flex w-9 h-9 rounded-xl bg-primary text-primary-foreground items-center justify-center">
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
          </Link>

          {showLogout && brand ? (
            <div className="flex items-center gap-2 sm:gap-3">
              <nav className="hidden sm:flex items-center gap-1">
                <NavLink
                  href="/brand"
                  active={location === "/brand"}
                  icon={<LayoutDashboard className="w-4 h-4" />}
                  label="Campañas"
                />
                <NavLink
                  href="/brand/insights"
                  active={location.startsWith("/brand/insights")}
                  icon={<BarChart3 className="w-4 h-4" />}
                  label="Insights"
                />
              </nav>
              <span className="text-sm text-muted-foreground hidden md:inline border-l border-border pl-3 ml-1">
                {brand.name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                disabled={logoutMutation.isPending}
                className="rounded-full"
              >
                <LogOut className="w-4 h-4 mr-1.5" />
                Salir
              </Button>
            </div>
          ) : null}
        </div>
      </header>
      <div className="container py-6 sm:py-8">{children}</div>
    </main>
  );
}

function NavLink({
  href,
  active,
  icon,
  label,
}: {
  href: string;
  active: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link href={href}>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer",
          active
            ? "bg-primary/15 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        {icon}
        {label}
      </span>
    </Link>
  );
}
