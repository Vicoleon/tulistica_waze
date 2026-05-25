import { ChevronRight, House } from "lucide-react";
import { Link, useLocation } from "wouter";

type Crumb = { label: string; href?: string };

/**
 * Static map of route → breadcrumb trail. Lives next to the sidebar IA so
 * navigation labels stay in sync between sidebar and breadcrumbs.
 */
const TRAILS: Array<{
  match: RegExp;
  build: (params: RegExpMatchArray) => Crumb[];
}> = [
  {
    match: /^\/dashboard\/?$/,
    build: () => [{ label: "Inicio" }],
  },
  {
    match: /^\/lists\/?$/,
    build: () => [
      { label: "Tu semana" },
      { label: "Mi lista" },
    ],
  },
  {
    match: /^\/lists\/([^/]+)\/?$/,
    build: () => [
      { label: "Tu semana" },
      { label: "Mi lista", href: "/lists" },
      { label: "Detalle" },
    ],
  },
  {
    match: /^\/recipes\/?$/,
    build: () => [
      { label: "Tu semana" },
      { label: "Recetario" },
    ],
  },
  {
    match: /^\/pantry\/?$/,
    build: () => [
      { label: "Tu semana" },
      { label: "Despensa" },
    ],
  },
  {
    match: /^\/map\/?$/,
    build: () => [
      { label: "Saber el precio" },
      { label: "Mapa de tiendas" },
    ],
  },
  {
    match: /^\/stores\/?$/,
    build: () => [
      { label: "Saber el precio" },
      { label: "Tiendas" },
    ],
  },
  {
    match: /^\/products\/?$/,
    build: () => [
      { label: "Saber el precio" },
      { label: "Buscar productos" },
    ],
  },
  {
    match: /^\/alerts\/?$/,
    build: () => [
      { label: "Saber el precio" },
      { label: "Alertas de precio" },
    ],
  },
  {
    match: /^\/optimize\/?$/,
    build: () => [
      { label: "Saber el precio" },
      { label: "Plan de compra" },
    ],
  },
  {
    match: /^\/scanner\/?$/,
    build: () => [
      { label: "Comunidad" },
      { label: "Escanear" },
    ],
  },
  {
    match: /^\/leaderboard\/?$/,
    build: () => [
      { label: "Comunidad" },
      { label: "Ranking" },
    ],
  },
  {
    match: /^\/profile\/?$/,
    build: () => [
      { label: "Comunidad" },
      { label: "Mi perfil" },
    ],
  },
];

function trailFor(pathname: string): Crumb[] {
  for (const trail of TRAILS) {
    const m = pathname.match(trail.match);
    if (m) return trail.build(m);
  }
  return [];
}

export function Breadcrumbs() {
  const [location] = useLocation();
  const crumbs = trailFor(location);

  // Hide on /dashboard since the page itself is the root of the app.
  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Migas de pan"
      className="flex items-center gap-1.5 text-[13px] text-muted-foreground/80 px-4 sm:px-6 lg:px-8 py-3 border-b border-border/60 bg-background/60"
    >
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label="Volver al inicio"
      >
        <House className="h-3.5 w-3.5" strokeWidth={1.8} />
      </Link>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span key={`${crumb.label}-${i}`} className="inline-flex items-center gap-1.5">
            <ChevronRight
              className="h-3 w-3 text-muted-foreground/50"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="hover:text-foreground transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={
                  isLast
                    ? "text-foreground font-medium"
                    : "text-muted-foreground/80"
                }
                aria-current={isLast ? "page" : undefined}
              >
                {crumb.label}
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
