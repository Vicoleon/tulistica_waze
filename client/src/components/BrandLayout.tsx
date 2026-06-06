import { useBrandAuth } from "@/hooks/useBrandAuth";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Megaphone,
  Receipt,
  Settings,
  LogOut,
  ShoppingCart,
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
  const { brand, loading, isAuthenticated, isVerified, refetch } = useBrandAuth();
  const [location, navigate] = useLocation();
  const logoutMutation = trpc.brandAuth.logout.useMutation();
  const resendMutation = trpc.brandAuth.resendVerification.useMutation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!isAuthenticated) {
    navigate("/brand/login");
    return null;
  }

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
      await refetch();
      navigate("/brand/login");
    } catch {
      toast.error("Logout failed");
    }
  };

  const handleResend = async () => {
    try {
      const result = await resendMutation.mutateAsync();
      if (result.alreadyVerified) {
        toast.success("Already verified");
        await refetch();
      } else {
        toast.success("Verification email sent");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to send");
    }
  };

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex flex-col w-64 border-r bg-card">
        <Link href="/brand/dashboard" className="flex items-center gap-2 h-16 px-6 border-b">
          <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center">
            <ShoppingCart className="w-5 h-5 text-primary-foreground" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold">Tulistica</span>
            <span className="text-xs text-muted-foreground">Brand portal</span>
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
          <div className="text-xs text-muted-foreground truncate">{brand?.email}</div>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-3"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" /> Log out
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="md:hidden border-b bg-card px-4 h-14 flex items-center justify-between">
          <Link href="/brand/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <ShoppingCart className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-sm">Brand portal</span>
          </Link>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </header>

        {brand && !isVerified && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                Verify your email <strong>{brand.email}</strong> to publish campaigns or download invoices.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={handleResend}
              disabled={resendMutation.isPending}
            >
              Resend verification
            </Button>
          </div>
        )}

        {requireVerified && !isVerified ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
              <h2 className="text-xl font-semibold">Email verification required</h2>
              <p className="text-sm text-muted-foreground">
                Please confirm your email before accessing this page. We sent a
                verification link to <strong>{brand?.email}</strong>.
              </p>
              <Button onClick={handleResend} disabled={resendMutation.isPending}>
                Resend verification email
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
