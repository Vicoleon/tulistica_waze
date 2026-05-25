import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import {
  BellRing,
  ChefHat,
  House,
  LogOut,
  MapPin,
  Package,
  PanelLeft,
  ScanLine,
  Search,
  Sparkles,
  Store,
  Trophy,
  User as UserIcon,
} from "lucide-react";
import {
  CSSProperties,
  FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { useLocation } from "wouter";
import { hasCompletedOnboarding } from "../../../shared/profile";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { Button } from "./ui/button";

type NavItem = {
  icon: typeof House;
  label: string;
  path: string;
};

type NavGroup = {
  eyebrow: string;
  items: NavItem[];
};

const navGroups: NavGroup[] = [
  {
    eyebrow: "Tu semana",
    items: [
      { icon: House, label: "Mi lista", path: "/lists" },
      { icon: ChefHat, label: "Recetario", path: "/recipes" },
      { icon: Package, label: "Despensa", path: "/pantry" },
    ],
  },
  {
    eyebrow: "Saber el precio",
    items: [
      { icon: MapPin, label: "Mapa de tiendas", path: "/map" },
      { icon: Store, label: "Tiendas", path: "/stores" },
      { icon: Search, label: "Buscar productos", path: "/products" },
      { icon: BellRing, label: "Alertas de precio", path: "/alerts" },
      { icon: Sparkles, label: "Plan de compra", path: "/optimize" },
    ],
  },
  {
    eyebrow: "Comunidad",
    items: [
      { icon: ScanLine, label: "Escanear", path: "/scanner" },
      { icon: Trophy, label: "Ranking", path: "/leaderboard" },
      { icon: UserIcon, label: "Mi perfil", path: "/profile" },
    ],
  },
];

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
  // the dashboard. The onboarding page itself is registered outside this
  // layout, so checking the path avoids an infinite redirect loop.
  useEffect(() => {
    if (loading || !user) return;
    if (location.startsWith("/onboarding")) return;
    if (!hasCompletedOnboarding(user.preferences)) {
      navigate("/onboarding");
    }
  }, [loading, user, location, navigate]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-8 p-8 max-w-md w-full">
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary inline-block" />
              <span className="font-serif font-semibold text-lg">
                tulistica
              </span>
            </div>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              tu lista, en su lugar
            </span>
          </div>
          <div className="flex flex-col items-center gap-3 text-center">
            <h1 className="font-serif text-2xl font-semibold tracking-tight">
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
            className="w-full rounded-full bg-primary text-primary-foreground shadow-sm hover:shadow-md transition-all"
          >
            Sign in
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

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileSearch, setShowMobileSearch] = useState(false);

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

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setLocation("/products");
      return;
    }
    setLocation(`/products?q=${encodeURIComponent(query)}`);
    setShowMobileSearch(false);
  };

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r border-sidebar-border"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-16 justify-center border-b border-sidebar-border/60">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-sidebar-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Mostrar u ocultar menú"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <button
                  onClick={() => setLocation("/dashboard")}
                  className="flex flex-col gap-0 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
                  aria-label="Ir al inicio de Tulistica"
                >
                  <span className="flex items-center gap-2 leading-none">
                    <span className="h-2 w-2 rounded-full bg-primary inline-block shrink-0" />
                    <span className="font-serif font-semibold text-base tracking-tight truncate">
                      tulistica
                    </span>
                  </span>
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/80 truncate mt-1 pl-4">
                    tu lista, en su lugar
                  </span>
                </button>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0 px-2 py-3">
            {navGroups.map((group, groupIdx) => (
              <div
                key={group.eyebrow}
                className={groupIdx > 0 ? "mt-4" : undefined}
              >
                {!isCollapsed && (
                  <div className="sidebar-eyebrow">{group.eyebrow}</div>
                )}
                <SidebarMenu>
                  {group.items.map((item) => {
                    const isActive = location === item.path;
                    return (
                      <SidebarMenuItem key={item.path}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => setLocation(item.path)}
                          tooltip={item.label}
                          className="h-10 font-normal data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-medium"
                        >
                          <item.icon
                            className={`h-4 w-4 ${
                              isActive
                                ? "text-primary"
                                : "text-muted-foreground"
                            }`}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-3 rounded-xl px-1 py-1 hover:bg-sidebar-accent/60 transition-colors w-full text-left group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Avatar className="h-9 w-9 border border-sidebar-border shrink-0">
                    <AvatarFallback className="text-xs font-semibold bg-accent/40 text-accent-foreground">
                      {user?.name?.charAt(0).toUpperCase() ?? "T"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0 group-data-[collapsible=icon]:hidden">
                    <p className="text-sm font-medium truncate leading-none">
                      {user?.name || "-"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate mt-1.5">
                      {user?.email || "-"}
                    </p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setLocation("/profile")}
                  className="cursor-pointer"
                >
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Mi perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Cerrar sesión</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${
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
          <SidebarTrigger className="h-9 w-9 rounded-lg shrink-0 md:hidden" />

          {/* Desktop / md+ search */}
          <form
            onSubmit={handleSearch}
            className="hidden md:flex flex-1 max-w-xl items-center gap-2"
            role="search"
          >
            <div className="relative flex-1">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
                strokeWidth={1.8}
              />
              <Input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar producto…"
                aria-label="Buscar producto"
                className="pl-9 h-10 rounded-xl bg-paper-deep/40 border-border focus-visible:ring-primary"
              />
            </div>
          </form>

          {/* Mobile search trigger */}
          <button
            type="button"
            onClick={() => setShowMobileSearch((v) => !v)}
            className="md:hidden ml-auto h-9 w-9 inline-flex items-center justify-center rounded-lg hover:bg-accent/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Buscar producto"
            aria-expanded={showMobileSearch}
          >
            <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
          </button>

          <div className="hidden md:block ml-auto" />

          {!isMobile && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="h-9 w-9 inline-flex items-center justify-center rounded-full border border-border bg-card hover:bg-accent/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label="Abrir menú de usuario"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs font-semibold bg-accent/40 text-accent-foreground">
                      {user?.name?.charAt(0).toUpperCase() ?? "T"}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setLocation("/profile")}
                  className="cursor-pointer"
                >
                  <UserIcon className="mr-2 h-4 w-4" />
                  <span>Mi perfil</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>Cerrar sesión</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Mobile search drawer-row */}
        {showMobileSearch && (
          <div className="md:hidden border-b border-border bg-background/95 px-3 py-3 backdrop-blur">
            <form onSubmit={handleSearch} role="search">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none"
                  strokeWidth={1.8}
                />
                <Input
                  autoFocus
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar producto…"
                  aria-label="Buscar producto"
                  className="pl-9 h-11 rounded-xl bg-paper-deep/40 border-border focus-visible:ring-primary"
                />
              </div>
            </form>
          </div>
        )}

        <Breadcrumbs />
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </SidebarInset>
    </>
  );
}
