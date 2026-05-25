import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Check, ChevronRight, Copy, Edit2, MapPin, Package,
  Plus, Search, Share2, ShoppingBasket, Sparkles, Trash2,
} from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";

// TODO: hook to real estimated total + cheapest store breakdown
const ESTIMATED_TOTAL_PLACEHOLDER = 12400;
const CHEAPEST_STORE_PLACEHOLDER = { name: "PriceSmart", total: 11840 };

function formatColones(amount: number): string {
  return `₡ ${new Intl.NumberFormat("es-CR").format(Math.round(amount))}`;
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short" }).format(date);
}

const AVATAR_TINTS = [
  "bg-accent text-accent-foreground",
  "bg-secondary text-secondary-foreground",
  "bg-sky text-sky-foreground",
] as const;

function avatarLetter(name: string | null | undefined, fallback: string): string {
  const source = (name || fallback || "?").trim();
  return source.charAt(0).toUpperCase();
}

export default function ListDetail() {
  const { id } = useParams<{ id: string }>();
  const listId = parseInt(id || "0");
  const { user } = useAuth();
  const [newItemName, setNewItemName] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: list, isLoading } = trpc.lists.getById.useQuery(
    { id: listId },
    { enabled: listId > 0 }
  );

  // Search products as user types
  const { data: searchResults } = trpc.products.search.useQuery(
    { query: newItemName, limit: 5 },
    { enabled: newItemName.length >= 2 && !selectedProduct }
  );

  const addItem = trpc.lists.addItem.useMutation({
    onSuccess: () => {
      utils.lists.getById.invalidate({ id: listId });
      setNewItemName("");
      setSelectedProduct(null);
      setShowProductSearch(false);
      socket?.emit("list_update", {
        listId,
        action: "item_added",
        userId: user?.id,
        userName: user?.name,
      });
    },
  });

  const checkItem = trpc.lists.checkItem.useMutation({
    onMutate: async ({ id: itemId, isChecked }) => {
      await utils.lists.getById.cancel({ id: listId });
      const prev = utils.lists.getById.getData({ id: listId });
      if (prev) {
        utils.lists.getById.setData({ id: listId }, {
          ...prev,
          items: prev.items.map((item) =>
            item.id === itemId ? { ...item, isChecked } : item
          ),
        });
      }
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) utils.lists.getById.setData({ id: listId }, ctx.prev);
    },
    onSuccess: (_, { id: itemId, isChecked }) => {
      socket?.emit("list_update", {
        listId,
        action: "item_checked",
        itemId,
        userId: user?.id,
        userName: user?.name,
        data: { isChecked },
      });
    },
  });

  const removeItem = trpc.lists.removeItem.useMutation({
    onSuccess: (_, { id: itemId }) => {
      utils.lists.getById.invalidate({ id: listId });
      socket?.emit("list_update", {
        listId,
        action: "item_removed",
        itemId,
        userId: user?.id,
        userName: user?.name,
      });
    },
  });

  const updateList = trpc.lists.update.useMutation({
    onSuccess: (data) => {
      utils.lists.getById.invalidate({ id: listId });
      if (data?.shareCode) {
        toast.success("Lista lista para compartir");
      } else {
        toast.success("Guardado");
      }
      setIsEditingName(false);
    },
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    const socketInstance = io({
      path: "/api/socket.io",
    });

    socketInstance.on("connect", () => {
      socketInstance.emit("join_list", listId);
    });

    socketInstance.on("list_update", (update) => {
      if (update.userId !== user?.id) {
        utils.lists.getById.invalidate({ id: listId });
        toast.info(`${update.userName || "Alguien"} actualizó la lista`);
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.emit("leave_list", listId);
      socketInstance.disconnect();
    };
  }, [listId, user?.id]);

  // Focus rename input when editing starts
  useEffect(() => {
    if (isEditingName) {
      requestAnimationFrame(() => nameInputRef.current?.select());
    }
  }, [isEditingName]);

  const copyShareCode = () => {
    if (list?.shareCode) {
      navigator.clipboard.writeText(list.shareCode);
      toast.success("Código copiado");
    }
  };

  const handleAddItem = () => {
    if (selectedProduct) {
      addItem.mutate({ listId, productId: selectedProduct.id, customName: selectedProduct.name });
    } else if (newItemName.trim()) {
      addItem.mutate({ listId, customName: newItemName.trim() });
    }
  };

  const selectProduct = (product: { id: number; name: string }) => {
    setSelectedProduct(product);
    setNewItemName(product.name);
    setShowProductSearch(false);
  };

  const startRename = () => {
    if (!list) return;
    setDraftName(list.name);
    setIsEditingName(true);
  };

  const commitRename = () => {
    const trimmed = draftName.trim();
    if (!trimmed || !list || trimmed === list.name) {
      setIsEditingName(false);
      return;
    }
    updateList.mutate({ id: listId, name: trimmed });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <h2 className="font-serif text-2xl font-semibold tracking-tight">No encontramos esta lista</h2>
          <p className="mt-2 font-serif italic text-muted-foreground">
            Puede que se haya borrado o que el enlace esté roto.
          </p>
          <Link href="/lists">
            <Button className="mt-6 h-11 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90">
              Volver a mis listas
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const uncheckedItems = list.items.filter((item) => !item.isChecked);
  const checkedItems = list.items.filter((item) => item.isChecked);
  const hasProducts = searchResults && searchResults.length > 0;
  const totalItems = list.items.length;
  const editors = [
    { name: user?.name || "Tú", isMe: true },
    ...list.members.map((m) => ({ name: m.userName ?? null, isMe: false })),
  ].slice(0, 4);

  return (
    <div className="min-h-screen bg-background pb-28 lg:pb-12">
      <main className="container max-w-6xl py-8 sm:py-12">
        {/* Top breadcrumb */}
        <div className="mb-6 flex items-center gap-3 text-sm">
          <Link href="/lists" className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-muted-foreground transition-colors duration-200 hover:bg-paper-deep hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            <span>Mis listas</span>
          </Link>
        </div>

        {/* Page title block */}
        <header className="mb-10">
          <p className="font-serif italic text-sm uppercase tracking-[0.18em] text-muted-foreground">
            Mi lista
          </p>
          {isEditingName ? (
            <form
              className="mt-1 flex flex-wrap items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                commitRename();
              }}
            >
              <Input
                ref={nameInputRef}
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsEditingName(false);
                  }
                }}
                className="h-12 max-w-md rounded-xl border-border bg-card font-serif text-2xl font-semibold tracking-tight sm:text-3xl"
              />
              <Button
                type="submit"
                size="sm"
                className="h-10 rounded-full bg-primary px-4 text-primary-foreground hover:bg-primary/90"
                disabled={updateList.isPending}
              >
                Guardar
              </Button>
            </form>
          ) : (
            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                {list.name}
              </h1>
              <Button
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-muted-foreground hover:bg-paper-deep hover:text-primary"
                onClick={startRename}
                aria-label="Cambiar nombre de la lista"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
            </div>
          )}
          <p className="mt-3 font-mono text-sm text-muted-foreground">
            {totalItems} {totalItems === 1 ? "producto" : "productos"} · estimado{" "}
            <span className="text-foreground">{formatColones(ESTIMATED_TOTAL_PLACEHOLDER)}</span>{" "}
            · creada el {formatDate(list.createdAt)}
          </p>
        </header>

        {/* Two-column on lg */}
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* LEFT — items */}
          <section className="space-y-6">
            {/* Quick add */}
            <div className="relative">
              <div className="rounded-3xl border border-border bg-card p-3 shadow-paper sm:p-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddItem();
                  }}
                  className="flex items-center gap-2 sm:gap-3"
                >
                  <div className="relative flex-1">
                    <Input
                      ref={inputRef}
                      placeholder="Agregá algo…"
                      value={newItemName}
                      onChange={(e) => {
                        setNewItemName(e.target.value);
                        setSelectedProduct(null);
                        setShowProductSearch(true);
                      }}
                      onFocus={() => setShowProductSearch(true)}
                      className={`h-12 rounded-xl border-transparent bg-paper-deep px-4 text-base placeholder:text-muted-foreground focus-visible:border-primary focus-visible:bg-card ${
                        selectedProduct ? "pr-24" : ""
                      }`}
                    />
                    {selectedProduct && (
                      <span className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[11px] font-medium text-secondary-foreground">
                        <Package className="h-3 w-3" /> Vinculado
                      </span>
                    )}
                  </div>
                  <Button
                    type="submit"
                    size="icon"
                    className="h-12 w-12 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={!newItemName.trim() || addItem.isPending}
                    aria-label="Agregar"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </form>
              </div>

              {/* Product search dropdown */}
              {showProductSearch && hasProducts && newItemName.length >= 2 && !selectedProduct && (
                <div className="absolute left-0 right-16 top-full z-40 mt-2 overflow-hidden rounded-2xl border border-border bg-card shadow-paper-lg">
                  <div className="border-b border-dashed border-border bg-paper-deep px-4 py-2">
                    <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                      <Search className="h-3 w-3" /> Elegí un producto para comparar precios
                    </p>
                  </div>
                  {searchResults.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-200 hover:bg-paper-deep"
                      onClick={() => selectProduct(product)}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-peach-soft text-accent-foreground">
                        <Package className="h-4 w-4" />
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="truncate font-medium text-foreground">{product.name}</div>
                        {product.brand && (
                          <div className="truncate font-mono text-xs text-muted-foreground">{product.brand}</div>
                        )}
                      </div>
                      {product.category && (
                        <span className="rounded-full bg-sage-soft px-2.5 py-0.5 text-[11px] text-secondary-foreground">
                          {product.category}
                        </span>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="w-full border-t border-dashed border-border px-4 py-3 text-left text-sm text-muted-foreground transition-colors duration-200 hover:bg-paper-deep"
                    onClick={() => setShowProductSearch(false)}
                  >
                    Agregar "{newItemName}" como nota libre
                  </button>
                </div>
              )}
            </div>

            {/* Items */}
            {list.items.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center shadow-paper">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-peach-soft">
                  <ShoppingBasket className="h-8 w-8 text-accent-foreground" />
                </div>
                <h3 className="mt-5 font-serif text-xl font-semibold tracking-tight">
                  Tu lista todavía está vacía.
                </h3>
                <p className="mt-2 font-serif italic text-muted-foreground">
                  Escribí lo que necesites arriba — papas, aceite, cilantro…
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {uncheckedItems.length > 0 && (
                  <div>
                    <h3 className="px-1 pb-2 font-serif italic text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      Por comprar · {uncheckedItems.length}
                    </h3>
                    <ul className="overflow-hidden rounded-3xl border border-border bg-card shadow-paper">
                      {uncheckedItems.map((item, index) => {
                        const displayName = item.productName || item.customName || "Producto";
                        const qty = item.quantity && item.quantity > 1
                          ? `— ${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
                          : item.unit
                            ? `— ${item.unit}`
                            : "";
                        return (
                          <li
                            key={item.id}
                            className={`group flex items-center gap-4 px-4 py-3.5 transition-colors duration-200 hover:bg-paper-deep sm:px-6 ${
                              index !== uncheckedItems.length - 1 ? "border-b border-dashed border-border" : ""
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => checkItem.mutate({ id: item.id, isChecked: true })}
                              aria-label={`Marcar ${displayName} como comprado`}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-border text-transparent transition-colors duration-200 hover:border-primary hover:text-primary"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <div className="flex flex-1 flex-wrap items-baseline gap-x-2">
                              <span className="font-sans text-base text-foreground">{displayName}</span>
                              {qty && (
                                <span className="font-serif italic text-sm text-muted-foreground">
                                  {qty}
                                </span>
                              )}
                              {item.productId && (
                                <span className="ml-1 inline-flex items-center gap-1 rounded-full bg-sage-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-secondary-foreground">
                                  <Package className="h-2.5 w-2.5" /> Optimizable
                                </span>
                              )}
                            </div>
                            <span className="hidden font-mono text-sm text-muted-foreground sm:inline">
                              {/* TODO: hook per-item unit price */}
                              ₡ —
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-full text-muted-foreground opacity-0 transition-opacity duration-200 hover:bg-rose-soft hover:text-destructive group-hover:opacity-100"
                              onClick={() => removeItem.mutate({ id: item.id })}
                              aria-label={`Eliminar ${displayName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {checkedItems.length > 0 && (
                  <div>
                    <h3 className="flex items-center gap-2 px-1 pb-2 font-serif italic text-xs uppercase tracking-[0.18em] text-muted-foreground">
                      <Check className="h-3.5 w-3.5" /> Ya en la canasta · {checkedItems.length}
                    </h3>
                    <ul className="overflow-hidden rounded-3xl border border-border bg-card/70 shadow-paper">
                      {checkedItems.map((item, index) => {
                        const displayName = item.productName || item.customName || "Producto";
                        return (
                          <li
                            key={item.id}
                            className={`group flex items-center gap-4 px-4 py-3.5 transition-colors duration-200 hover:bg-paper-deep sm:px-6 ${
                              index !== checkedItems.length - 1 ? "border-b border-dashed border-border" : ""
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => checkItem.mutate({ id: item.id, isChecked: false })}
                              aria-label={`Desmarcar ${displayName}`}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-colors duration-200"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <span className="flex-1 font-sans text-base text-muted-foreground line-through">
                              {displayName}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 rounded-full text-muted-foreground opacity-0 transition-opacity duration-200 hover:bg-rose-soft hover:text-destructive group-hover:opacity-100"
                              onClick={() => removeItem.mutate({ id: item.id })}
                              aria-label={`Eliminar ${displayName}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* RIGHT — sidebar (lg+) */}
          <aside className="hidden lg:block">
            <div className="sticky top-8 space-y-4">
              <div className="rounded-3xl border border-border bg-card p-6 shadow-paper">
                <p className="font-serif italic text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  Resumen
                </p>
                <p className="mt-3 font-serif text-4xl font-semibold tracking-tight text-foreground">
                  {formatColones(ESTIMATED_TOTAL_PLACEHOLDER)}
                </p>
                <p className="mt-1 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                  Estimado total
                </p>

                <div className="mt-5 flex items-start gap-2 rounded-2xl bg-secondary px-3 py-2.5 text-secondary-foreground">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="text-sm">
                    Mejor: <span className="font-semibold">{CHEAPEST_STORE_PLACEHOLDER.name}</span>{" "}
                    · <span className="font-mono">{formatColones(CHEAPEST_STORE_PLACEHOLDER.total)}</span>
                  </p>
                </div>

                <Link href={`/optimize?list=${listId}`} className="mt-5 block">
                  <Button className="h-12 w-full justify-between gap-2 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90">
                    Ver plan de compra
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>

                {list.isShared ? (
                  <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="mt-2 h-12 w-full gap-2 rounded-full border-border"
                      >
                        <Share2 className="h-4 w-4" /> Compartir lista
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle className="font-serif text-2xl">Compartir esta lista</DialogTitle>
                        <DialogDescription>
                          Pasale este código a la familia o a tu compañero de mandado. Lo escriben en
                          "Unirme con código" y entran a esta misma lista.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 pt-4">
                        <div className="flex items-center gap-2">
                          <Input
                            value={list.shareCode || ""}
                            readOnly
                            className="h-12 rounded-xl font-mono text-base tracking-widest"
                          />
                          <Button
                            onClick={copyShareCode}
                            size="icon"
                            className="h-12 w-12 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                            aria-label="Copiar código"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                ) : (
                  <Button
                    variant="outline"
                    className="mt-2 h-12 w-full gap-2 rounded-full border-border"
                    onClick={() => updateList.mutate({ id: listId, isShared: true })}
                    disabled={updateList.isPending}
                  >
                    <Share2 className="h-4 w-4" /> Compartir lista
                  </Button>
                )}
              </div>

              {/* Editors */}
              <div className="rounded-3xl border border-border bg-card p-6 shadow-paper">
                <p className="font-serif italic text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  En esta lista
                </p>
                <div className="mt-3 flex items-center -space-x-2">
                  {editors.map((editor, index) => (
                    <span
                      key={index}
                      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-card font-mono text-sm font-semibold ${AVATAR_TINTS[index % AVATAR_TINTS.length]}`}
                      title={editor.name || "Miembro"}
                    >
                      {avatarLetter(editor.name, editor.isMe ? "Yo" : "?")}
                    </span>
                  ))}
                  {list.members.length === 0 && !list.isShared && (
                    <p className="ml-3 font-serif italic text-sm text-muted-foreground">
                      Solo vos por ahora.
                    </p>
                  )}
                </div>
              </div>

              {/* Tienda más cercana — soft info card */}
              <div className="rounded-3xl border border-border bg-paper-deep p-6 shadow-paper">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-sky text-sky-foreground">
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="font-serif text-base font-semibold">Tu tienda de confianza está cerca.</p>
                    <p className="mt-1 font-serif italic text-sm text-muted-foreground">
                      Te avisamos si alguien de la familia agrega algo en lo que vas en camino.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </main>

      {/* Sticky mobile bottom bar */}
      <div className="sticky bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 px-4 py-3 shadow-paper-lg backdrop-blur lg:hidden">
        <Link href={`/optimize?list=${listId}`} className="block">
          <Button className="h-12 w-full justify-between gap-2 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90">
            <span>Ver plan de compra</span>
            <span className="font-mono">{formatColones(CHEAPEST_STORE_PLACEHOLDER.total)}</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
