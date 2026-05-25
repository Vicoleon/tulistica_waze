import { Card } from "@/components/ui/card";
import { useAnalytics } from "@/hooks/useAnalytics";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ArrowUpRight, BadgeCheck } from "lucide-react";
import { useLocation } from "wouter";
import { ANALYTICS_EVENTS } from "../../../shared/analytics";
import type { CampaignPlacement } from "../../../shared/campaigns";

interface SponsoredCardProps {
  placement: CampaignPlacement;
  /** Visual variant. `compact` for product-search inline slots, `full` for hero cards. */
  variant?: "full" | "compact";
  /** Optional explicit position in the result list — passed to analytics. */
  position?: number;
}

/**
 * Visible "Patrocinado por X" placement with click tracking.
 *
 * Mandated by §4.5 of TULISTICA_PRODUCT_NOTES.md: every paid slot must carry
 * a visible label so the user always knows what's organic vs paid.
 */
export function SponsoredCard({
  placement,
  variant = "full",
  position,
}: SponsoredCardProps) {
  const [, navigate] = useLocation();
  const { track } = useAnalytics();
  const recordClick = trpc.campaigns.recordClick.useMutation({ retry: false });

  const handleClick = () => {
    recordClick.mutate({ campaignId: placement.id });
    track(ANALYTICS_EVENTS.PRODUCT_CLICKED, {
      productId: placement.productId,
      isSponsored: true,
      position: position,
      source: placement.type,
    });
    if (placement.targetUrl) {
      if (placement.targetUrl.startsWith("/")) {
        navigate(placement.targetUrl);
      } else {
        window.open(placement.targetUrl, "_blank", "noopener,noreferrer");
      }
    }
  };

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "w-full text-left rounded-2xl border bg-paper-deep/60 border-accent/50 px-4 py-3",
          "shadow-sm hover:shadow-paper hover:-translate-y-0.5 transition-all",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        )}
        aria-label={`Patrocinado por ${placement.sponsor ?? "marca"}: ${
          placement.title ?? ""
        }`}
      >
        <div className="flex items-center justify-between gap-3 mb-1">
          <SponsoredLabel sponsor={placement.sponsor} />
          <ArrowUpRight className="w-4 h-4 text-muted-foreground" />
        </div>
        {placement.title ? (
          <p className="font-serif text-base leading-tight text-foreground">
            {placement.title}
          </p>
        ) : null}
        {placement.description ? (
          <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
            {placement.description}
          </p>
        ) : null}
      </button>
    );
  }

  return (
    <Card
      onClick={handleClick}
      className={cn(
        "rounded-3xl border bg-card p-5 sm:p-6 shadow-paper cursor-pointer transition-all",
        "border-accent/40 hover:border-accent hover:-translate-y-0.5 hover:shadow-paper-lg",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
      )}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <SponsoredLabel sponsor={placement.sponsor} />
        <ArrowUpRight className="w-4 h-4 text-muted-foreground shrink-0" />
      </div>
      {placement.title ? (
        <h3 className="font-serif text-xl sm:text-2xl leading-tight tracking-tight mb-2 text-foreground">
          {placement.title}
        </h3>
      ) : null}
      {placement.description ? (
        <p className="text-sm text-muted-foreground leading-relaxed">
          {placement.description}
        </p>
      ) : null}
    </Card>
  );
}

function SponsoredLabel({ sponsor }: { sponsor: string | null }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full",
        "bg-accent/40 text-accent-foreground",
        "font-mono text-[10px] uppercase tracking-[0.12em] font-semibold"
      )}
    >
      <BadgeCheck className="w-3 h-3" strokeWidth={2.4} />
      Patrocinado{sponsor ? ` · ${sponsor}` : ""}
    </span>
  );
}
