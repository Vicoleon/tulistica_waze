import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { BottomNav } from "@/components/BottomNav";
import { BrandMark } from "@/components/BrandMark";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CommandPalette } from "@/components/CommandPalette";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { cn } from "@/lib/utils";
import {
  isNavItemActive,
  NAV_GROUPS,
  navItemsForRole,
} from "@/navConfig";
import {
  LogOut,
  PanelLeft,
  Search,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import {
  CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import { hasCompletedOnboarding } from "../../../shared/profile";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 220;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  // Gate: first-time users get pushed through onboarding before they see
  // the dashboard — unless they explicitly skipped it (onboardingSkippedAt),
  // which must be honored or the skip button becomes an infinite loop.
  useEffect(() => {
    if (loading || !user) return;
    if (location.startsWith("/onboarding")) return;
    const prefs = user.preferences;
    if (hasCompletedOnboarding(prefs)) return;
    if (prefs?.onboardingSkippedAt) return;
    navigate("/onboarding");
  }, [loading, user, location, navigate]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <BrandMark withTagline className="items-center" />
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="font-serif text-3xl font-semibold tracking-tight">
              Iniciá sesión para abrir tu lista.
            </h1>
            <p className="text-sm text-muted-foreground max-w-sm">
              Tu canasta de la semana, tu despensa y tus alertas te esperan
              adentro.
            </p>
          </div>
          <Button
            onClick={() => {
              window.location.href = getLoginUrl();
            }}
            size="lg"
            className="w-full rounded-full shadow-sm hover:shadow-md transition-all"
          >
            Iniciar sesión
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type UserMenuProps = {
  align?: "start" | "end";
  children: React.ReactNode;
};

/** One user menu for the rail footer and the header avatar — never drifts. */
function UserMenu({ align = "end", children }: UserMenuProps) {
  const { user, logout } = useAuth();
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "super_admin";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuItem
          onClick={() => setLocation("/profile")}
          className="cursor-pointer"
        >
          <UserIcon className="mr-2 h-4 w-4" />
          <span>Mi perfil</span>
        </DropdownMenuItem>
        {isAdmin && (
          <DropdownMenuItem
            onClick={() => setLocation("/admin")}
            className="cursor-pointer"
          >
            <ShieldCheck className="mr-2 h-4 w-4" />
            <span>Administración</span>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={logout}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Cerrar sesión</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const navGroups = useMemo(() => {
    const items = navItemsForRole(user?.role);
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: items.filter((i) => i.group === g.key),
    })).filter((g) => g.items.length > 0);
  }, [user?.role]);

  // ⌘K / Ctrl+K opens the palette from anywhere in the app.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);

  return (
    <>
      <div className="relative hidden md:block" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-sidebar-border"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border/60">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring shrink-0"
                aria-label="Mostrar u ocultar menú"
              >
                <PanelLeft className="h-4 w-4 text-sidebar-foreground/60" />
              </button>
              {!isCollapsed ? (
                <button
                  onClick={() => setLocation("/dashboard")}
                  className="flex min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring rounded-md"
                  aria-label="Ir al inicio de Tulistica"
                >
                  <BrandMark variant="dark" withTagline />
                </button>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-2 py-3">
            {navGroups.map((group) => (
              <div key={group.key}>
                {!isCollapsed && group.eyebrow && (
                  <div className="sidebar-eyebrow">{group.eyebrow}</div>
                )}
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = isNavItemActive(item, location);
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className={cn(
                            "h-10 font-normal relative text-sidebar-foreground/75",
                            "hover:bg-sidebar-accent hover:text-sidebar-foreground",
                            "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-primary data-[active=true]:font-medium"
                          )}
                        >
                          {isActive && (
                            <span
                              aria-hidden="true"
                              className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-sidebar-primary"
                            />
                          )}
                          <item.icon
                            className={cn(
                              "h-4 w-4",
                              isActive
                                ? "text-sidebar-primary"
                                : "text-sidebar-foreground/50"
                            )}
                            strokeWidth={1.8}
                          />
                          <span>{item.label}</span>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </div>
            ))}
          </SidebarContent>

          <SidebarFooter className="p-3 border-t border-sidebar-border/60">
            <UserMenu align="end">
              <button className="flex items-center gap-3 rounded-xl px-1 py-1 hover:bg-sidebar-accent/60 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring">
                <Avatar className="h-9 w-9 border border-sidebar-border shrink-0">
                  <AvatarFallback className="text-xs font-semibold bg-sidebar-accent text-sidebar-foreground">
                    {user?.name?.charAt(0).toUpperCase() ?? "T"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                  <p className="text-sm font-medium truncate leading-none text-sidebar-foreground">
                    {user?.name || "-"}
                  </p>
                  <p className="text-xs text-sidebar-foreground/50 truncate mt-1.5">
                    {user?.email || "-"}
                  </p>
                </div>
              </button>
            </UserMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-sidebar-primary/30 transition-colors ${
            isCollapsed ? "hidden" : ""
          }`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        <div className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-background/85 px-3 sm:px-5 backdrop-blur supports-[backdrop-filter]:backdrop-blur">
          {/* Mobile: brand mark (nav lives in the bottom bar) */}
          <button
            onClick={() => setLocation("/dashboard")}
            className="md:hidden flex min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
            aria-label="Ir al inicio de Tulistica"
          >
            <BrandMark />
          </button>

          {/* Desktop / md+ search — opens the ⌘K palette */}
          <button
            type="button"
            onClick={openPalette}
            className={cn(
              "hidden md:flex flex-1 max-w-xl items-center gap-2 h-10 px-3 rounded-xl",
              "border border-input bg-paper-deep/40 text-sm text-muted-foreground",
              "hover:bg-paper-deep/70 transition-colors duration-200",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            )}
            aria-label="Buscar producto o sección"
          >
            <Search className="h-4 w-4 shrink-0" strokeWidth={1.8} />
            <span className="flex-1 text-left truncate">
              Buscar producto o sección…
            </span>
            <kbd className="hidden lg:inline-flex items-center gap-0.5 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              ⌘K
            </kbd>
          </button>

          {/* Mobile search trigger — same palette */}
          <button
            type="button"
            onClick={openPalette}
            className="md:hidden ml-auto h-10 w-10 inline-flex items-center justify-center rounded-lg hover:bg-accent/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Buscar producto o sección"
          >
            <Search className="h-5 w-5 text-muted-foreground" strokeWidth={1.8} />
          </button>

          <div className="hidden md:block ml-auto" />

          <UserMenu align="end">
            <button
              className="hidden md:inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card hover:bg-accent/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Abrir menú de usuario"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-xs font-semibold bg-accent/40 text-accent-foreground">
                  {user?.name?.charAt(0).toUpperCase() ?? "T"}
                </AvatarFallback>
              </Avatar>
            </button>
          </UserMenu>
        </div>

        <Breadcrumbs />
        <main className="flex-1 p-4 pb-28 sm:p-6 sm:pb-28 md:pb-6 lg:p-8">
          {children}
        </main>
      </SidebarInset>

      <BottomNav role={user?.role} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        role={user?.role}
      />
    </>
  );
}
