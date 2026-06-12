import {
  BellRing,
  CalendarRange,
  ChefHat,
  House,
  ListChecks,
  type LucideIcon,
  MapPin,
  Package,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Trophy,
  User,
  Wallet,
} from "lucide-react";

/**
 * Single source of truth for the consumer app's information architecture.
 * Feeds the desktop sidebar, the mobile bottom nav + "Más" sheet, the
 * breadcrumbs and the ⌘K command palette. Add a destination HERE and it
 * appears everywhere — orphan pages are no longer possible.
 */

export type NavGroupKey =
  | "inicio"
  | "tu-semana"
  | "ahorrar"
  | "seguir-precio"
  | "comunidad";

export type NavItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  group: NavGroupKey;
  /** Spoken label for breadcrumbs / palette when the group adds context. */
  groupLabel: string | null;
  /** primary → mobile bottom bar. secondary → "Más" sheet. */
  mobileTier: "primary" | "secondary";
  /** Only render for these roles (matches users.role). */
  roles?: string[];
  /** Search keywords for the command palette. */
  keywords?: string[];
};

export const NAV_GROUPS: Array<{ key: NavGroupKey; eyebrow: string | null }> = [
  { key: "inicio", eyebrow: null },
  { key: "tu-semana", eyebrow: "Tu semana" },
  { key: "ahorrar", eyebrow: "Ahorrar" },
  { key: "seguir-precio", eyebrow: "Seguir el precio" },
  { key: "comunidad", eyebrow: "Comunidad" },
];

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Inicio",
    path: "/dashboard",
    icon: House,
    group: "inicio",
    groupLabel: null,
    mobileTier: "primary",
    keywords: ["home", "dashboard", "principal"],
  },
  {
    label: "Mi lista",
    path: "/lists",
    icon: ListChecks,
    group: "tu-semana",
    groupLabel: "Tu semana",
    mobileTier: "primary",
    keywords: ["lista", "super", "mandado", "compras"],
  },
  {
    label: "Recetario",
    path: "/recipes",
    icon: ChefHat,
    group: "tu-semana",
    groupLabel: "Tu semana",
    mobileTier: "secondary",
    keywords: ["recetas", "cocina", "menu"],
  },
  {
    label: "Despensa",
    path: "/pantry",
    icon: Package,
    group: "tu-semana",
    groupLabel: "Tu semana",
    mobileTier: "secondary",
    keywords: ["pantry", "inventario", "alacena"],
  },
  {
    label: "Presupuesto",
    path: "/budget",
    icon: Wallet,
    group: "tu-semana",
    groupLabel: "Tu semana",
    mobileTier: "secondary",
    keywords: ["budget", "gasto", "plata", "dinero"],
  },
  {
    label: "Plan de compra",
    path: "/optimize",
    icon: Sparkles,
    group: "ahorrar",
    groupLabel: "Ahorrar",
    mobileTier: "primary",
    keywords: ["optimizar", "ruta", "donde comprar", "plan"],
  },
  {
    label: "Mapa de precios",
    path: "/map",
    icon: MapPin,
    group: "ahorrar",
    groupLabel: "Ahorrar",
    mobileTier: "secondary",
    keywords: ["mapa", "tiendas cerca", "ubicacion"],
  },
  {
    label: "Tiendas",
    path: "/stores",
    icon: Store,
    group: "ahorrar",
    groupLabel: "Ahorrar",
    mobileTier: "secondary",
    keywords: ["supermercados", "walmart", "pali", "automercado"],
  },
  {
    label: "Buscar productos",
    path: "/products",
    icon: Search,
    group: "ahorrar",
    groupLabel: "Ahorrar",
    mobileTier: "secondary",
    keywords: ["producto", "precio", "buscar"],
  },
  {
    label: "Escanear",
    path: "/scanner",
    icon: ScanLine,
    group: "ahorrar",
    groupLabel: "Ahorrar",
    mobileTier: "primary",
    keywords: ["scanner", "codigo de barras", "reportar precio"],
  },
  {
    label: "Alertas de precio",
    path: "/alerts",
    icon: BellRing,
    group: "seguir-precio",
    groupLabel: "Seguir el precio",
    mobileTier: "secondary",
    keywords: ["alertas", "avisos", "bajo de precio"],
  },
  {
    label: "Temporada",
    path: "/seasonal",
    icon: CalendarRange,
    group: "seguir-precio",
    groupLabel: "Seguir el precio",
    mobileTier: "secondary",
    keywords: ["temporada", "ofertas", "estacional", "ferias"],
  },
  {
    label: "Ranking",
    path: "/leaderboard",
    icon: Trophy,
    group: "comunidad",
    groupLabel: "Comunidad",
    mobileTier: "secondary",
    keywords: ["leaderboard", "puntos", "comunidad"],
  },
  {
    label: "Mi perfil",
    path: "/profile",
    icon: User,
    group: "comunidad",
    groupLabel: "Comunidad",
    mobileTier: "secondary",
    keywords: ["perfil", "cuenta", "configuracion"],
  },
  {
    label: "Administración",
    path: "/admin",
    icon: ShieldCheck,
    group: "comunidad",
    groupLabel: "Comunidad",
    mobileTier: "secondary",
    roles: ["super_admin"],
    keywords: ["admin", "panel"],
  },
];

/** Items visible for a given role (undefined role → only ungated items). */
export function navItemsForRole(role: string | null | undefined): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => !item.roles || (role != null && item.roles.includes(role))
  );
}

/** The 4 fixed slots of the mobile bottom bar (the 5th is "Más"). */
export function mobilePrimaryItems(role: string | null | undefined): NavItem[] {
  return navItemsForRole(role).filter((i) => i.mobileTier === "primary");
}

/** Everything that lives behind "Más" on mobile. */
export function mobileSecondaryItems(
  role: string | null | undefined
): NavItem[] {
  return navItemsForRole(role).filter((i) => i.mobileTier === "secondary");
}

/** Active-state test — prefix match so /lists/42 lights up "Mi lista". */
export function isNavItemActive(item: NavItem, location: string): boolean {
  if (item.path === "/dashboard") {
    return location === "/dashboard" || location === "/dashboard/";
  }
  return location === item.path || location.startsWith(`${item.path}/`);
}

/** Breadcrumb trail for a location, derived from the same config. */
export function breadcrumbTrailFor(
  location: string
): Array<{ label: string; href?: string }> {
  const item = NAV_ITEMS.find((i) => isNavItemActive(i, location));
  if (!item || item.path === "/dashboard") return [];
  const trail: Array<{ label: string; href?: string }> = [];
  if (item.groupLabel) trail.push({ label: item.groupLabel });
  const isDetail = location !== item.path && location.startsWith(item.path);
  trail.push({ label: item.label, href: isDetail ? item.path : undefined });
  if (isDetail) trail.push({ label: "Detalle" });
  return trail;
}
