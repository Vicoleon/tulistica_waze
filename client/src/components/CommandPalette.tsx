import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { NAV_GROUPS, navItemsForRole } from "@/navConfig";
import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: string | null | undefined;
}

/**
 * ⌘K palette — every destination in the app plus free-text product search.
 * Driven by navConfig so it can never drift from the sidebar.
 */
export function CommandPalette({
  open,
  onOpenChange,
  role,
}: CommandPaletteProps) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");

  // Reset the query each time the palette opens fresh.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const groups = useMemo(() => {
    const items = navItemsForRole(role);
    return NAV_GROUPS.map((g) => ({
      ...g,
      items: items.filter((i) => i.group === g.key),
    })).filter((g) => g.items.length > 0);
  }, [role]);

  const go = (path: string) => {
    onOpenChange(false);
    navigate(path);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Buscar en Tulistica"
      description="Navegá a cualquier sección o buscá un producto"
    >
      <CommandInput
        placeholder="Buscar producto o ir a…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>Nada por aquí. Probá con otra palabra.</CommandEmpty>
        {query.trim().length > 0 && (
          <>
            <CommandGroup heading="Productos">
              <CommandItem
                value={`buscar-producto-${query}`}
                onSelect={() =>
                  go(`/products?q=${encodeURIComponent(query.trim())}`)
                }
              >
                <Search className="text-gold" strokeWidth={1.8} />
                <span>
                  Buscar “<span className="font-medium">{query.trim()}</span>”
                  en productos
                </span>
              </CommandItem>
            </CommandGroup>
            <CommandSeparator />
          </>
        )}
        {groups.map((group) => (
          <CommandGroup
            key={group.key}
            heading={group.eyebrow ?? "Inicio"}
          >
            {group.items.map((item) => (
              <CommandItem
                key={item.path}
                value={`${item.label} ${item.keywords?.join(" ") ?? ""}`}
                onSelect={() => go(item.path)}
              >
                <item.icon
                  className="text-muted-foreground"
                  strokeWidth={1.8}
                />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
