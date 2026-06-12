import { cn } from "@/lib/utils";

interface BrandMarkProps {
  /** "light" = ink on porcelain. "dark" = ivory on obsidian rail. */
  variant?: "light" | "dark";
  /** Show the tagline under the wordmark. */
  withTagline?: boolean;
  className?: string;
}

/**
 * The one Tulistica lockup: gold point + lowercase serif wordmark.
 * Every surface (landing, auth, app shell, brand portal) uses this —
 * the brand must never change identity between screens.
 */
export function BrandMark({
  variant = "light",
  withTagline = false,
  className,
}: BrandMarkProps) {
  return (
    <span className={cn("flex flex-col min-w-0", className)}>
      <span className="flex items-center gap-2 leading-none">
        <span
          className="h-1.5 w-1.5 rounded-full bg-gold inline-block shrink-0"
          aria-hidden="true"
        />
        <span
          className={cn(
            "font-serif font-semibold text-xl tracking-tight truncate",
            variant === "dark" ? "text-sidebar-foreground" : "text-foreground"
          )}
        >
          tulistica
        </span>
      </span>
      {withTagline && (
        <span
          className={cn(
            "font-mono text-[9px] uppercase tracking-[0.24em] truncate mt-1 pl-3.5",
            variant === "dark"
              ? "text-sidebar-foreground/50"
              : "text-muted-foreground/70"
          )}
        >
          tu lista, en su lugar
        </span>
      )}
    </span>
  );
}
