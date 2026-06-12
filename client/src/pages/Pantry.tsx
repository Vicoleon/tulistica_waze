import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  Package, Plus, Bell, BellOff, AlertTriangle,
  ShoppingCart, Clock, Loader2,
} from "lucide-react";
import { toast } from "sonner";

type PantryFilter = "todos" | "se-acaba" | "suficiente" | "sobra";

interface PantryRowItem {
  id: number;
  name: string;
  level: number; // 0-100
  daysLeft: number | null;
  notifyWhenLow: boolean;
  lastPurchasedAt: Date | string | null;
}

// Compute a fill level (0-100) from quantity. The backend doesn't give us a
// "current level" yet, so we synthesize a plausible value from quantity + cycle.
function deriveLevel(quantity: number, avgDays: number | null, daysSinceLast: number | null): number {
  if (avgDays && daysSinceLast != null) {
    const remaining = Math.max(0, avgDays - daysSinceLast);
    return Math.min(100, Math.round((remaining / Math.max(1, avgDays)) * 100));
  }
  // Fallback: clamp quantity to 0-100, treating 1 as half-full.
  return Math.min(100, Math.max(0, Math.round(quantity * 50)));
}

function levelTone(level: number): { fill: string; label: string; chip: string } {
  if (level < 20) {
    return {
      fill: "var(--primary)",
      label: "se acaba pronto",
      chip: "bg-primary/15 text-primary",
    };
  }
  if (level < 50) {
    return {
      fill: "var(--butter)",
      label: "queda poco",
      chip: "bg-butter-soft text-butter-foreground",
    };
  }
  return {
    fill: "var(--secondary-foreground)",
    label: "suficiente",
    chip: "bg-sage-soft text-secondary-foreground",
  };
}

/**
 * Visual shelf — three wooden shelves with up to 4 jars each.
 * SVG was chosen over CSS-only because we need precise control over the jar
 * "fill" rectangle that animates from the bottom, and SVG keeps everything
 * in a single, scalable element that respects prefers-reduced-motion via the
 * global CSS rule.
 */
function ShelfVisualization({ items }: { items: PantryRowItem[] }) {
  const slots = useMemo(() => {
    const padded: (PantryRowItem | null)[] = Array.from({ length: 12 }, (_, i) => items[i] ?? null);
    return [padded.slice(0, 4), padded.slice(4, 8), padded.slice(8, 12)];
  }, [items]);

  return (
    <Card className="rounded-3xl shadow-paper overflow-hidden border-border/60">
      <CardContent className="p-6 md:p-8 bg-paper-deep">
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="font-serif text-xl text-foreground">
            Tu <span className="italic text-primary">despensa</span> hoy
          </h2>
          <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
            12 espacios
          </span>
        </div>

        <svg
          viewBox="0 0 480 320"
          className="w-full h-auto"
          role="img"
          aria-label="Visualización de los frascos de tu despensa"
        >
          <defs>
            <linearGradient id="shelf-wood" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="oklch(0.55 0.08 50)" />
              <stop offset="100%" stopColor="oklch(0.42 0.07 45)" />
            </linearGradient>
          </defs>

          {slots.map((row, rowIndex) => {
            const shelfY = 88 + rowIndex * 100;
            return (
              <g key={rowIndex}>
                {/* shelf plank */}
                <rect
                  x="10"
                  y={shelfY}
                  width="460"
                  height="6"
                  rx="2"
                  fill="url(#shelf-wood)"
                />
                {/* shelf shadow */}
                <rect
                  x="10"
                  y={shelfY + 6}
                  width="460"
                  height="3"
                  fill="oklch(0.4 0.06 45)"
                  opacity="0.18"
                />

                {row.map((item, colIndex) => {
                  const jarX = 40 + colIndex * 110;
                  const jarTop = shelfY - 64;
                  const jarHeight = 60;
                  const fillPct = item ? Math.max(4, item.level) : 0;
                  const fillH = (jarHeight - 8) * (fillPct / 100);
                  const fillY = jarTop + 4 + (jarHeight - 8 - fillH);
                  const tone = item ? levelTone(item.level) : null;

                  return (
                    <g key={colIndex}>
                      {/* lid */}
                      <rect
                        x={jarX + 4}
                        y={jarTop - 10}
                        width="50"
                        height="10"
                        rx="3"
                        fill="oklch(0.34 0.06 40)"
                        opacity={item ? 0.9 : 0.18}
                      />
                      {/* jar body */}
                      <rect
                        x={jarX}
                        y={jarTop}
                        width="58"
                        height={jarHeight}
                        rx="6"
                        fill="oklch(1 0 0)"
                        stroke="oklch(0.86 0.025 60)"
                        strokeWidth="1.4"
                      />
                      {/* fill */}
                      {item && tone && (
                        <rect
                          x={jarX + 4}
                          y={fillY}
                          width="50"
                          height={fillH}
                          rx="3"
                          fill={tone.fill}
                          opacity="0.85"
                        />
                      )}
                      {/* highlight */}
                      <rect
                        x={jarX + 8}
                        y={jarTop + 6}
                        width="6"
                        height={jarHeight - 16}
                        rx="3"
                        fill="white"
                        opacity={item ? 0.35 : 0.1}
                      />
                      {/* label */}
                      <text
                        x={jarX + 29}
                        y={shelfY + 26}
                        textAnchor="middle"
                        fontFamily="Nunito, system-ui, sans-serif"
                        fontSize="11"
                        fontWeight="600"
                        fill={item ? "oklch(0.36 0.04 50)" : "oklch(0.68 0.02 60)"}
                      >
                        {item ? item.name.slice(0, 10) : "—"}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        <div className="mt-6 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-primary" /> se acaba pronto
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-butter" /> queda poco
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded-sm bg-secondary-foreground/70" /> suficiente
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

const QUICK_ADD = ["arroz", "frijol", "café", "aceite", "azúcar", "sal"];

export default function Pantry() {
  const { isAuthenticated } = useAuth();
  const [newItemName, setNewItemName] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [filter, setFilter] = useState<PantryFilter>("todos");

  const utils = trpc.useUtils();
  const { data: pantryItems, isLoading } = trpc.pantry.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: restockSuggestions } = trpc.pantry.getRestockSuggestions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: lists } = trpc.lists.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const addItem = trpc.pantry.add.useMutation({
    onSuccess: () => {
      utils.pantry.getAll.invalidate();
      setNewItemName("");
      setShowAddDialog(false);
      toast.success("Lo agregamos a tu despensa.");
    },
    onError: (err) => toast.error(err.message),
  });

  const updateItem = trpc.pantry.update.useMutation({
    onSuccess: () => {
      utils.pantry.getAll.invalidate();
    },
  });

  const addToList = trpc.lists.addItem.useMutation({
    onSuccess: () => {
      toast.success("Agregado a tu lista.");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleQuickAdd = (name: string) => {
    addItem.mutate({ customName: name });
  };

  const handleAddToList = (item: { productId?: number | null; name: string }) => {
    const activeList = lists?.[0];
    if (!activeList) {
      toast.error("Primero creá una lista para agregar productos.");
      return;
    }
    addToList.mutate({
      listId: activeList.id,
      productId: item.productId ?? undefined,
      customName: item.productId ? undefined : item.name,
      quantity: 1,
    });
  };

  const rows: PantryRowItem[] = useMemo(() => {
    if (!pantryItems) return [];
    return pantryItems.map((item: any) => {
      const daysSince = item.lastPurchasedAt
        ? Math.floor((Date.now() - new Date(item.lastPurchasedAt).getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const avgDays = item.avgDaysBetweenPurchases ?? null;
      const level = deriveLevel(item.quantity ?? 1, avgDays, daysSince);
      const daysLeft = avgDays != null && daysSince != null ? Math.max(0, avgDays - daysSince) : null;
      return {
        id: item.id,
        name: item.productName || item.customName || "Producto",
        level,
        daysLeft,
        notifyWhenLow: !!item.notifyWhenLow,
        lastPurchasedAt: item.lastPurchasedAt,
      } satisfies PantryRowItem;
    });
  }, [pantryItems]);

  const filteredRows = useMemo(() => {
    switch (filter) {
      case "se-acaba":
        return rows.filter((r) => r.level < 20);
      case "suficiente":
        return rows.filter((r) => r.level >= 20 && r.level < 80);
      case "sobra":
        return rows.filter((r) => r.level >= 80);
      default:
        return rows;
    }
  }, [rows, filter]);

  const filters: { key: PantryFilter; label: string; count?: number }[] = [
    { key: "todos", label: "Todos", count: rows.length },
    { key: "se-acaba", label: "Se acaba pronto", count: rows.filter((r) => r.level < 20).length },
    { key: "suficiente", label: "Suficiente", count: rows.filter((r) => r.level >= 20 && r.level < 80).length },
    { key: "sobra", label: "Sobra", count: rows.filter((r) => r.level >= 80).length },
  ];

  return (
    <div className="min-h-screen bg-background">
      <main className="container py-8 max-w-4xl">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-2">
            <p className="page-eyebrow">Tu semana</p>
            <h1 className="font-serif text-3xl md:text-4xl text-foreground tracking-tight">
              Despensa
            </h1>
            <p className="text-muted-foreground max-w-xl">
              Cuando algo se acaba, vos sos el primero en saberlo.
            </p>
          </div>
          <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="gap-1 rounded-full h-11 px-4 self-start sm:self-auto shrink-0"
              >
                <Plus className="w-4 h-4" /> Agregar a despensa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl">Agregar a tu despensa</DialogTitle>
                <DialogDescription>
                  Empezá con lo básico. Después te avisamos cuando se vaya acabando.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <Input
                  placeholder="Arroz, café, aceite…"
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  className="rounded-xl h-12"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newItemName && !addItem.isPending) {
                      addItem.mutate({ customName: newItemName });
                    }
                  }}
                />
                <Button
                  className="w-full h-11 rounded-full gap-2"
                  onClick={() => addItem.mutate({ customName: newItemName })}
                  disabled={!newItemName || addItem.isPending}
                >
                  {addItem.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" /> Agregar
                    </>
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : rows.length === 0 ? (
          <Card className="rounded-3xl shadow-paper border-border/60">
            <CardContent className="text-center py-14 px-6">
              <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
              <h3 className="font-serif text-2xl mb-2">
                Tu despensa todavía está vacía.
              </h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                Empezá con lo básico. Agregá las cosas que siempre tenés en casa.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mb-6">
                {QUICK_ADD.map((name) => (
                  <Button
                    key={name}
                    variant="outline"
                    size="sm"
                    className="rounded-full h-10 px-4 capitalize"
                    onClick={() => handleQuickAdd(name)}
                    disabled={addItem.isPending}
                  >
                    + {name}
                  </Button>
                ))}
              </div>
              <Button
                onClick={() => setShowAddDialog(true)}
                className="rounded-full h-11 px-5 gap-2"
              >
                <Plus className="w-4 h-4" /> Agregar a despensa
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <ShelfVisualization items={rows} />

            {/* Restock suggestions */}
            {restockSuggestions && restockSuggestions.length > 0 && (
              <Card className="mt-8 rounded-3xl border-primary/30 bg-rose-soft">
                <CardContent className="p-6">
                  <div className="flex items-start gap-3 mb-4">
                    <AlertTriangle className="w-5 h-5 text-primary mt-0.5" />
                    <div>
                      <h3 className="font-serif text-xl">
                        Estos se te están acabando.
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Según tus compras anteriores — agregalos a la lista para no quedarte sin.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {restockSuggestions.map((item: any) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-3 rounded-2xl bg-card border border-border/50"
                      >
                        <div className="min-w-0">
                          <div className="font-serif text-base truncate">
                            {item.productName || item.customName}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Clock className="w-3 h-3" />
                            Lo comprás cada{" "}
                            <span className="font-mono">
                              {Math.round(item.avgDaysBetweenPurchases || 7)}
                            </span>{" "}
                            días
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="rounded-full h-10 gap-1 ml-3 shrink-0"
                          onClick={() =>
                            handleAddToList({
                              productId: item.productId,
                              name: item.productName || item.customName || "Producto",
                            })
                          }
                          disabled={addToList.isPending}
                        >
                          <ShoppingCart className="w-4 h-4" /> A la lista
                        </Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Filter chips */}
            <div className="mt-10 mb-4 flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {filters.map((f) => {
                const active = filter === f.key;
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    className={`shrink-0 inline-flex items-center gap-2 rounded-full h-10 px-4 text-sm font-medium transition-colors min-h-11 ${
                      active
                        ? "bg-foreground text-background"
                        : "bg-card border border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {f.label}
                    {typeof f.count === "number" && (
                      <span className={`font-mono text-xs ${active ? "opacity-80" : "text-muted-foreground"}`}>
                        {f.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Item rows */}
            <Card className="rounded-3xl shadow-paper border-border/60 overflow-hidden">
              <CardContent className="p-0">
                {filteredRows.length === 0 ? (
                  <div className="text-center py-10 px-6 text-muted-foreground">
                    Nada en este filtro por ahora.
                  </div>
                ) : (
                  filteredRows.map((item, idx) => {
                    const tone = levelTone(item.level);
                    return (
                      <div
                        key={item.id}
                        className={`flex items-center gap-4 p-4 md:p-5 ${
                          idx !== filteredRows.length - 1 ? "border-b border-dashed border-border" : ""
                        }`}
                      >
                        {/* mini jar */}
                        <div className="w-10 h-12 relative shrink-0">
                          <div className="absolute inset-x-0 -top-1 h-2 mx-1 rounded-sm bg-foreground/30" />
                          <div className="absolute inset-0 top-1 rounded-md border border-border bg-card overflow-hidden">
                            <div
                              className="absolute bottom-0 inset-x-0 transition-[height] duration-300"
                              style={{
                                height: `${Math.max(6, item.level)}%`,
                                background: tone.fill,
                                opacity: 0.85,
                              }}
                            />
                          </div>
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="font-serif text-lg text-foreground truncate capitalize">
                            {item.name}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 ${tone.chip}`}>
                              {tone.label}
                            </span>
                            {item.daysLeft != null && (
                              <span className="font-mono italic">
                                ~{item.daysLeft} {item.daysLeft === 1 ? "día" : "días"}
                              </span>
                            )}
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-11 w-11 rounded-full text-muted-foreground hover:text-primary"
                          onClick={() =>
                            updateItem.mutate({
                              id: item.id,
                              notifyWhenLow: !item.notifyWhenLow,
                            })
                          }
                          aria-label={item.notifyWhenLow ? "Desactivar aviso" : "Activar aviso"}
                        >
                          {item.notifyWhenLow ? (
                            <Bell className="w-4 h-4 text-primary" />
                          ) : (
                            <BellOff className="w-4 h-4" />
                          )}
                        </Button>

                        <Button
                          size="sm"
                          className="rounded-full h-11 px-4 gap-1 shrink-0"
                          onClick={() => handleAddToList({ name: item.name })}
                          disabled={addToList.isPending}
                        >
                          <ShoppingCart className="w-4 h-4 hidden sm:block" />
                          <span>A la lista</span>
                        </Button>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
