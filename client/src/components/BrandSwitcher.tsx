import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface Membership {
  brand: { id: number; companyName: string };
  membershipRole: "owner" | "admin" | "staff";
}

interface BrandSwitcherProps {
  activeBrandId: number;
  memberships: Membership[];
}

export function BrandSwitcher({ activeBrandId, memberships }: BrandSwitcherProps) {
  const utils = trpc.useUtils();
  const switchMutation = trpc.brandAuth.switchActiveBrand.useMutation({
    onSuccess: () => {
      utils.brandAuth.me.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (memberships.length === 0) return null;

  const active = memberships.find(m => m.brand.id === activeBrandId);

  if (memberships.length === 1) {
    return (
      <div className="text-sm text-muted-foreground px-3 py-1.5">
        {active?.brand.companyName}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          <span className="font-medium">{active?.brand.companyName ?? "Sin marca activa"}</span>
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {memberships.map(m => (
          <DropdownMenuItem
            key={m.brand.id}
            onSelect={() => {
              if (m.brand.id !== activeBrandId) {
                switchMutation.mutate({ brandId: m.brand.id });
              }
            }}
            disabled={m.brand.id === activeBrandId}
          >
            <span className="flex-1">{m.brand.companyName}</span>
            <Badge variant="outline" className="ml-2">{m.membershipRole}</Badge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
