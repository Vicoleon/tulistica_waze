import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  isNavItemActive,
  mobilePrimaryItems,
  mobileSecondaryItems,
  type NavItem,
} from "@/navConfig";
import { LayoutGrid } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

interface BottomNavProps {
  role: string | null | undefined;
}

/**
 * Mobile bottom navigation — obsidian bar, gold active state, raised
 * scanner action in the center. The 5th slot ("Más") opens a sheet with
 * every remaining destination, fed by the same navConfig as the sidebar.
 */
export function BottomNav({ role }: BottomNavProps) {
  const [location, navigate] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const primary = mobilePrimaryItems(role);
  const secondary = mobileSecondaryItems(role);
  // Bar order: Inicio · Mi lista · [Escanear] · Plan de compra · Más
  const scanner = primary.find((i) => i.path === "/scanner");
  const slots = primary.filter((i) => i.path !== "/scanner");
  const moreActive = secondary.some((i) => isNavItemActive(i, location));

  const go = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  const renderTab = (item: NavItem) => {
    const active = isNavItemActive(item, location);
    return (
      <button
        key={item.path}
        type="button"
        onClick={() => go(item.path)}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center justify-center gap-1 flex-1 min-w-0 h-full",
          "transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring rounded-lg",
          active
            ? "text-sidebar-primary"
            : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
        )}
      >
        <item.icon className="h-5 w-5" strokeWidth={active ? 2 : 1.6} />
        <span
          className={cn(
            "text-[10px] leading-none tracking-wide truncate max-w-full px-1",
            active ? "font-semibold" : "font-medium"
          )}
        >
          {item.label === "Plan de compra" ? "Plan" : item.label}
        </span>
      </button>
    );
  };

  return (
    <nav
      aria-label="Navegación principal"
      className="md:hidden fixed bottom-0 inset-x-0 z-50 bg-sidebar border-t border-sidebar-border pb-safe"
    >
      <div className="relative flex items-stretch h-16 px-1">
        {slots.slice(0, 2).map(renderTab)}

        {/* Center action — Escanear, raised with a gold ring */}
        {scanner && (
          <div className="relative flex-1 flex justify-center">
            <button
              type="button"
              onClick={() => go(scanner.path)}
              aria-label={scanner.label}
              aria-current={
                isNavItemActive(scanner, location) ? "page" : undefined
              }
              className={cn(
                "absolute -top-5 h-14 w-14 rounded-full grid place-items-center",
                "bg-sidebar-primary text-sidebar-primary-foreground shadow-paper-lg",
                "ring-4 ring-background transition-transform duration-200 active:scale-95",
                "focus:outline-none focus-visible:ring-4 focus-visible:ring-sidebar-ring"
              )}
            >
              <scanner.icon className="h-6 w-6" strokeWidth={1.8} />
            </button>
            <span className="self-end pb-2 text-[10px] leading-none font-medium text-sidebar-foreground/60">
              {scanner.label}
            </span>
          </div>
        )}

        {slots.slice(2).map(renderTab)}

        {/* Más — everything else, same source of truth */}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Más secciones"
              className={cn(
                "flex flex-col items-center justify-center gap-1 flex-1 min-w-0 h-full",
                "transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring rounded-lg",
                moreActive
                  ? "text-sidebar-primary"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground"
              )}
            >
              <LayoutGrid
                className="h-5 w-5"
                strokeWidth={moreActive ? 2 : 1.6}
              />
              <span
                className={cn(
                  "text-[10px] leading-none tracking-wide",
                  moreActive ? "font-semibold" : "font-medium"
                )}
              >
                Más
              </span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-2xl border-border bg-background pb-safe max-h-[75vh] overflow-y-auto"
          >
            <SheetHeader className="pb-1">
              <SheetTitle className="font-serif text-xl text-left">
                Todas las secciones
              </SheetTitle>
            </SheetHeader>
            <div className="grid grid-cols-3 gap-2 px-4 pb-6">
              {secondary.map((item) => {
                const active = isNavItemActive(item, location);
                return (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => go(item.path)}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border px-2 py-4 min-h-[80px]",
                      "transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "border-gold/50 bg-gold-soft text-foreground"
                        : "border-border bg-card text-foreground hover:bg-accent/50"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-5 w-5",
                        active ? "text-gold" : "text-muted-foreground"
                      )}
                      strokeWidth={1.8}
                    />
                    <span className="text-xs font-medium leading-tight text-center">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </nav>
  );
}
