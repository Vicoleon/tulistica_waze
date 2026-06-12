import { breadcrumbTrailFor } from "@/navConfig";
import { ChevronRight, House } from "lucide-react";
import { Link, useLocation } from "wouter";

/**
 * Breadcrumbs derived from navConfig — the same source of truth as the
 * sidebar and the mobile nav, so labels can never drift.
 */
export function Breadcrumbs() {
  const [location] = useLocation();
  const crumbs = breadcrumbTrailFor(location);

  // Hide on /dashboard since the page itself is the root of the app.
  if (crumbs.length === 0) return null;

  return (
    <nav
      aria-label="Migas de pan"
      className="flex items-center gap-1.5 text-[13px] text-muted-foreground/80 px-4 sm:px-6 lg:px-8 py-3 border-b border-border/60 bg-background/60"
    >
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 hover:text-foreground transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Volver al inicio"
      >
        <House className="h-3.5 w-3.5" strokeWidth={1.8} />
      </Link>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <span
            key={`${crumb.label}-${i}`}
            className="inline-flex items-center gap-1.5"
          >
            <ChevronRight
              className="h-3 w-3 text-muted-foreground/50"
              strokeWidth={1.8}
              aria-hidden="true"
            />
            {crumb.href && !isLast ? (
              <Link
                href={crumb.href}
                className="hover:text-foreground transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
