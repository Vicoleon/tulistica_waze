import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Check, ShoppingBasket, Store, Tag, Undo2,
} from "lucide-react";
import { Link, useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { chainDisplayName } from "@shared/chains";
import { ReportPriceDialog } from "@/components/map/ReportPriceDialog";

function formatColones(amount: number): string {
  return `₡ ${new Intl.NumberFormat("es-CR").format(Math.round(amount))}`;
}

type PricedItem = {
  productId: number;
  price: number;
  source: string;
  isVerified: boolean | null;
  updatedAt: Date | string | null;
  storeId: number;
};

/**
 * Wave 4 · In-store SHOPPING MODE — the "phone in hand, walking the aisles"
 * moment. Full-screen (no DashboardLayout). Check items off as you grab them,
 * watch the running cart total climb, and report the real shelf price for any
 * row in one tap.
 */
export default function ShoppingMode() {
  const { id } = useParams<{ id: string }>();
  const listId = parseInt(id || "0");
  const [, navigate] = useLocation();

  // Which supermarket the user is physically shopping in. Defaults to the
  // ?chain param, else the best (cheapest) chain once prices load.
  const initialChainParam = new URLSearchParams(window.location.search).get("chain");
  const [selectedChainId, setSelectedChainId] = useState<string | null>(initialChainParam);

  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportProduct, setReportProduct] = useState<{ id: number; name: string } | null>(null);

  const utils = trpc.useUtils();

  const { data: list, isLoading } = trpc.lists.getById.useQuery(
    { id: listId },
    { enabled: listId > 0 },
  );

  const { data: comparison } = trpc.lists.getPriceComparison.useQuery(
    { id: listId },
    { enabled: listId > 0 },
  );

  const chains = comparison?.chains ?? [];
  const bestChain = chains[0] ?? null;
  const selectedChain =
    chains.find((c) => c.chainId === selectedChainId) ?? bestChain;

  // Resolve the representative store so reports land at a real branch and the
  // header can name where you are.
  const representativeStoreId = selectedChain?.representativeStoreId ?? null;
  const { data: store } = trpc.stores.getById.useQuery(
    { id: representativeStoreId ?? 0 },
    { enabled: !!representativeStoreId },
  );

  // Default the selected supermarket to the best option once prices arrive.
  useEffect(() => {
    if (!selectedChainId && bestChain) {
      setSelectedChainId(bestChain.chainId);
    }
  }, [bestChain, selectedChainId]);

  // Best-effort geolocation once on mount so reports can clear the geofence.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {
        /* ignore — reporting still works, it just won't auto-verify */
      },
    );
  }, []);

  const checkItem = trpc.lists.checkItem.useMutation({
    onMutate: async ({ id: itemId, isChecked }) => {
      await utils.lists.getById.cancel({ id: listId });
      const prev = utils.lists.getById.getData({ id: listId });
      if (prev) {
        utils.lists.getById.setData({ id: listId }, {
          ...prev,
          items: prev.items.map((item) =>
            item.id === itemId ? { ...item, isChecked } : item,
          ),
        });
      }
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) utils.lists.getById.setData({ id: listId }, ctx.prev);
    },
  });

  // Per-product price lookup for the chain we're shopping in.
  const priceByProduct = useMemo(() => {
    const map = new Map<number, PricedItem>();
    selectedChain?.items.forEach((it) => map.set(it.productId, it as PricedItem));
    return map;
  }, [selectedChain]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
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

  // Unchecked first (in list order), checked dropped to the bottom.
  const uncheckedItems = list.items.filter((it) => !it.isChecked);
  const checkedItems = list.items.filter((it) => it.isChecked);
  const orderedItems = [...uncheckedItems, ...checkedItems];

  const totalCount = list.items.length;
  const remaining = uncheckedItems.length;

  // Running cart total = sum of CHECKED items' price × quantity at this chain.
  const cartTotal = checkedItems.reduce((sum, item) => {
    if (!item.productId) return sum;
    const priced = priceByProduct.get(item.productId);
    if (!priced) return sum;
    return sum + priced.price * Math.max(1, item.quantity ?? 1);
  }, 0);

  const chainName = selectedChain ? chainDisplayName(selectedChain.chainId) : "";

  const finishShopping = () => {
    const summary = selectedChain
      ? `Compra terminada · ${formatColones(cartTotal)} en ${chainName}`
      : "Compra terminada";
    toast.success(summary);
    navigate(`/lists/${listId}`);
  };

  const openReport = (productId: number, name: string) => {
    setReportProduct({ id: productId, name });
    setReportOpen(true);
  };

  const isEmpty = totalCount === 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <Link
            href={`/lists/${listId}`}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-paper-deep hover:text-foreground"
            aria-label="Volver a la lista"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="font-serif italic text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Comprando en
            </p>
            <h1 className="truncate font-serif text-xl font-semibold tracking-tight text-foreground">
              {selectedChain ? (
                <em className="font-serif italic text-primary">{chainName}</em>
              ) : (
                list.name
              )}
            </h1>
            {store?.name && (
              <p className="truncate font-mono text-xs text-muted-foreground">{store.name}</p>
            )}
          </div>
        </div>

        {/* Switch which supermarket you're shopping in */}
        {chains.length > 1 && (
          <div className="mx-auto max-w-2xl px-4 pb-3">
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1">
              {chains.map((chain) => {
                const isSelected = chain.chainId === selectedChain?.chainId;
                const isBest = bestChain?.chainId === chain.chainId;
                return (
                  <button
                    key={chain.chainId}
                    type="button"
                    onClick={() => setSelectedChainId(chain.chainId)}
                    aria-pressed={isSelected}
                    className={`flex shrink-0 items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-foreground hover:bg-paper-deep"
                    }`}
                  >
                    <Store className="h-3.5 w-3.5" />
                    {chainDisplayName(chain.chainId)}
                    {isBest && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${
                          isSelected
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-butter text-butter-foreground"
                        }`}
                      >
                        Más barato
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </header>

      {/* Body */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6 pb-40">
        {selectedChain?.confidence === "low" && (
          <p className="mb-4 rounded-2xl bg-butter-soft px-4 py-2.5 font-serif italic text-sm text-butter-foreground">
            Ojo: la mayoría de estos precios son estimados. Confirmá el real con el
            botón <span className="font-semibold">reportar</span> mientras comprás.
          </p>
        )}

        {isEmpty ? (
          <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-paper">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-peach-soft text-accent-foreground">
              <ShoppingBasket className="h-8 w-8" />
            </div>
            <h3 className="mt-5 font-serif text-xl font-semibold tracking-tight">
              No hay nada que comprar todavía.
            </h3>
            <p className="mt-2 font-serif italic text-muted-foreground">
              Agregá productos a tu lista y volvé a entrar a modo compra.
            </p>
            <Link href={`/lists/${listId}`}>
              <Button className="mt-6 h-11 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90">
                Volver a la lista
              </Button>
            </Link>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {orderedItems.map((item) => {
              const displayName = item.productName || item.customName || "Producto";
              const qty =
                item.quantity && item.quantity > 1
                  ? `${item.quantity}${item.unit ? ` ${item.unit}` : ""}`
                  : item.unit || "";
              const priced = item.productId ? priceByProduct.get(item.productId) : undefined;
              const checked = item.isChecked;

              return (
                <li
                  key={item.id}
                  className={`flex items-center gap-3 rounded-3xl border px-3 py-3 shadow-paper transition-colors duration-200 sm:px-4 ${
                    checked
                      ? "border-border bg-card/60"
                      : "border-border bg-card"
                  }`}
                >
                  {/* Big check / scratch toggle */}
                  <button
                    type="button"
                    onClick={() => checkItem.mutate({ id: item.id, isChecked: !checked })}
                    aria-label={
                      checked
                        ? `Devolver ${displayName} a la lista`
                        : `Marcar ${displayName} como comprado`
                    }
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200 ${
                      checked
                        ? "border-secondary bg-secondary text-secondary-foreground"
                        : "border-border text-transparent hover:border-primary hover:text-primary"
                    }`}
                  >
                    {checked ? <Undo2 className="h-5 w-5" /> : <Check className="h-6 w-6" />}
                  </button>

                  {/* Name + qty */}
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate font-sans text-base ${
                        checked ? "text-muted-foreground line-through" : "text-foreground"
                      }`}
                    >
                      {displayName}
                    </p>
                    {qty && (
                      <p className="font-serif italic text-xs text-muted-foreground">{qty}</p>
                    )}
                  </div>

                  {/* Price at this chain */}
                  <div className="shrink-0 text-right">
                    {priced ? (
                      <span
                        className={`font-mono text-sm font-semibold ${
                          checked ? "text-muted-foreground line-through" : "text-foreground"
                        }`}
                      >
                        {formatColones(priced.price)}
                      </span>
                    ) : (
                      <span className="font-mono text-[11px] text-muted-foreground/70">
                        sin precio
                      </span>
                    )}
                  </div>

                  {/* Report real shelf price (only for catalog products) */}
                  {item.productId && representativeStoreId && (
                    <button
                      type="button"
                      onClick={() => openReport(item.productId as number, displayName)}
                      aria-label={`Reportar precio de ${displayName}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-200 hover:bg-peach-soft hover:text-accent-foreground"
                    >
                      <Tag className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      {/* Sticky bottom cart bar */}
      {!isEmpty && (
        <div className="sticky bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 px-4 py-3 shadow-paper-lg backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-mono text-2xl font-semibold tracking-tight text-foreground">
                {formatColones(cartTotal)}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {remaining > 0
                  ? `faltan ${remaining} de ${totalCount}`
                  : `¡todo en la canasta! · ${totalCount} ${totalCount === 1 ? "producto" : "productos"}`}
              </p>
            </div>
            <Button
              onClick={finishShopping}
              className="h-12 shrink-0 gap-2 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90"
            >
              <ShoppingBasket className="h-4 w-4" />
              Terminar compra
            </Button>
          </div>
        </div>
      )}

      {/* Report price for the row you're standing in front of */}
      {representativeStoreId && (
        <ReportPriceDialog
          open={reportOpen}
          onOpenChange={setReportOpen}
          storeId={representativeStoreId}
          storeName={store?.name || chainName}
          userLocation={userLocation}
          presetProduct={reportProduct}
        />
      )}
    </div>
  );
}
