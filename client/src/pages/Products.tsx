import { useEffect, useRef, useState } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";
import { ANALYTICS_EVENTS } from "../../../shared/analytics";
import { SponsoredCard } from "@/components/SponsoredCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Search, Barcode, Tag, ArrowRight, Plus, Star, Trophy, Package,
} from "lucide-react";
import { Link, useLocation, useSearch } from "wouter";
import { toast } from "sonner";

// Stable rotation of warm tints for store name pills.
const STORE_TINTS = [
  "bg-peach-soft text-accent-foreground",
  "bg-sage-soft text-secondary-foreground",
  "bg-butter-soft text-butter-foreground",
  "bg-rose-soft text-rose-foreground",
  "bg-sky-soft text-sky-foreground",
];
function tintFor(seed: string | number): string {
  const s = String(seed);
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return STORE_TINTS[Math.abs(hash) % STORE_TINTS.length];
}

const formatCRC = (n: number) =>
  new Intl.NumberFormat("es-CR", { maximumFractionDigits: 0 }).format(n);

// TODO: replace mocked store rows with a real `productPrices.getByProduct(productId)` call
// once the route exists. Kept here so the comparator reads as designed.
function mockedStoresFor(productId: number) {
  const seed = productId % 5;
  const base = 1000 + ((productId * 37) % 1500);
  return [
    { id: 1 + seed, name: "AutoMercado Escazú", price: base, distanceKm: 1.2 },
    { id: 2 + seed, name: "Más x Menos Sabana", price: base + 180, distanceKm: 2.4 },
    { id: 3 + seed, name: "Perimercados Heredia", price: base + 320, distanceKm: 3.1 },
  ].sort((a, b) => a.price - b.price);
}

export default function Products() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const [searchQuery, setSearchQuery] = useState("");

  // Pre-fill from ?q= (entry point from the global top-bar search).
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    const q = params.get("q");
    if (q && q !== searchQuery) {
      setSearchQuery(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchString]);

  const { data: products, isLoading } = trpc.products.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 2 }
  );

  // Debounced analytics — fire once per "settled" query, not on every keystroke.
  const { track } = useAnalytics();
  const lastTrackedQuery = useRef<string>("");
  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length < 3) return;
    if (trimmed === lastTrackedQuery.current) return;
    const handle = setTimeout(() => {
      if (isLoading) return;
      track(ANALYTICS_EVENTS.PRODUCT_SEARCH, {
        query: trimmed,
        resultsCount: products?.length ?? 0,
      });
      lastTrackedQuery.current = trimmed;
    }, 600);
    return () => clearTimeout(handle);
  }, [searchQuery, isLoading, products, track]);

  return (
    <div className="min-h-screen bg-background">
      <main className="container py-6 sm:py-8 space-y-6">
        {/* Page heading */}
        <header className="space-y-2">
          <p className="page-eyebrow">Ahorrar</p>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h1 className="font-serif text-3xl sm:text-4xl text-foreground">
              Buscar productos
            </h1>
            <Link href="/scanner">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-border min-h-11 hover:bg-paper-deep"
              >
                <Barcode className="w-4 h-4 mr-1.5" />
                Escanear código
              </Button>
            </Link>
          </div>
          <p className="text-muted-foreground max-w-2xl">
            Ponele nombre a lo que estás buscando y te decimos dónde sale más barato hoy.
          </p>
        </header>

        {/* Big search input */}
        <div className="max-w-2xl">
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus
              placeholder="ej. aceite Capullo 1L, arroz Tío Pelón…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-14 h-14 rounded-2xl text-base sm:text-lg bg-card border-border shadow-paper focus-visible:ring-primary"
              aria-label="Buscar productos"
            />
          </div>
          {searchQuery.length > 0 && searchQuery.length < 3 && (
            <p className="mt-2 text-xs text-muted-foreground font-serif italic px-2">
              Escribí al menos 3 letras para buscar.
            </p>
          )}
        </div>

        {/* Results */}
        {searchQuery.length < 3 ? (
          <ProductsEmpty />
        ) : isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : products && products.length > 0 ? (
          <div className="grid gap-4 sm:gap-5">
            <SponsoredSearchSlot query={searchQuery} />
            {products.map((product: any, index: number) => (
              <ProductResultCard key={product.id} product={product} position={index} />
            ))}
          </div>
        ) : (
          <ProductsNoMatch
            query={searchQuery}
            onGoToList={() => navigate("/lists")}
          />
        )}
      </main>
    </div>
  );
}

// ---------- Cards ----------

function ProductResultCard({
  product,
  position,
}: {
  product: any;
  position: number;
}) {
  const stores = mockedStoresFor(product.id);
  const bestId = stores[0]?.id;
  const { track } = useAnalytics();

  const handleAddToList = () => {
    track(ANALYTICS_EVENTS.PRODUCT_CLICKED, {
      productId: product.id,
      position,
      isSponsored: Boolean(product.isSponsored),
      source: "search",
    });
    // TODO: wire to lists.addItem mutation. For now, toast feedback only.
    toast.success(`${product.name} agregado a tu lista`);
  };

  return (
    <Card
      className={`rounded-3xl border bg-card overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-paper-lg ${
        product.isSponsored
          ? "border-accent/60 shadow-paper"
          : "border-border shadow-paper"
      }`}
    >
      <CardContent className="p-5 grid gap-5 md:grid-cols-[112px_1fr] lg:grid-cols-[120px_1fr_280px]">
        {/* Image */}
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            width={120}
            height={120}
            className="w-28 h-28 lg:w-30 lg:h-30 object-cover rounded-2xl bg-paper-deep shrink-0"
          />
        ) : (
          <div className="w-28 h-28 lg:w-30 lg:h-30 rounded-2xl bg-paper-deep flex items-center justify-center shrink-0">
            <Package className="w-10 h-10 text-muted-foreground" />
          </div>
        )}

        {/* Middle: name, brand, tags, actions */}
        <div className="min-w-0 space-y-3">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <h3 className="font-serif text-xl text-foreground leading-tight">
                {product.name}
              </h3>
              {product.brand && (
                <p className="text-sm text-muted-foreground">{product.brand}</p>
              )}
            </div>
            {product.isSponsored && (
              <Badge
                variant="outline"
                className="rounded-full bg-butter-soft text-butter-foreground border-butter/40 font-sans"
              >
                <Star className="w-3 h-3 mr-1 fill-current" />
                Patrocinado
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap text-sm">
            {product.category && (
              <Badge
                variant="outline"
                className="rounded-full bg-sage-soft text-secondary-foreground border-secondary/40 capitalize"
              >
                {product.category}
              </Badge>
            )}
            {product.barcode && (
              <span className="text-xs text-muted-foreground font-mono flex items-center gap-1.5">
                <Barcode className="w-3.5 h-3.5" />
                {product.barcode}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <Button
              onClick={handleAddToList}
              className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90 min-h-11"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Agregar a mi lista
            </Button>
            <Link href={`/map?product=${product.id}`}>
              <Button
                variant="outline"
                className="rounded-full border-border min-h-11"
              >
                Ver en el mapa
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Right: mini comparator — 3 cheapest stores */}
        <div className="lg:border-l lg:border-border lg:pl-5 space-y-2">
          <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground font-serif italic flex items-center gap-1.5">
            <Trophy className="w-3.5 h-3.5 text-butter" />
            Dónde sale más barato
          </p>
          <ul className="space-y-0">
            {stores.map((s, idx) => {
              const isBest = s.id === bestId;
              return (
                <li
                  key={s.id}
                  className={`flex items-center gap-2 py-2 ${
                    idx < stores.length - 1
                      ? "border-b border-dashed border-border"
                      : ""
                  } ${
                    isBest
                      ? "bg-secondary/20 border-secondary/40 rounded-xl -mx-2 px-2 my-0.5"
                      : ""
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-serif text-sm font-semibold shrink-0 ${tintFor(
                      s.id
                    )}`}
                  >
                    {s.name[0]?.toUpperCase() ?? "?"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-tight truncate">{s.name}</p>
                    <p className="text-[11px] text-muted-foreground font-mono tabular-nums">
                      {s.distanceKm.toFixed(1)} km
                    </p>
                  </div>
                  <span
                    className={`font-mono font-semibold tabular-nums shrink-0 ${
                      isBest ? "text-primary" : ""
                    }`}
                  >
                    ₡{formatCRC(s.price)}
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-muted-foreground italic pt-1">
            {/* TODO: wire to real price comparator. */}
            Precios reportados por la comunidad.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- Empty states ----------

function ProductsEmpty() {
  return (
    <Card className="rounded-3xl border border-dashed border-border bg-card/60 shadow-paper">
      <CardContent className="py-12 px-6 text-center space-y-3 max-w-md mx-auto">
        <div className="mx-auto w-16 h-16 rounded-full bg-paper-deep flex items-center justify-center">
          <Search className="w-7 h-7 text-primary" />
        </div>
        <h3 className="font-serif text-2xl text-foreground">
          Buscá un producto
        </h3>
        <p className="text-muted-foreground">
          Te decimos en cuál tienda sale más barato hoy.
        </p>
      </CardContent>
    </Card>
  );
}

function ProductsNoMatch({
  query,
  onGoToList,
}: {
  query: string;
  onGoToList: () => void;
}) {
  return (
    <Card className="rounded-3xl border border-dashed border-border bg-card/60 shadow-paper">
      <CardContent className="py-12 px-6 text-center space-y-4 max-w-md mx-auto">
        <div className="mx-auto w-16 h-16 rounded-full bg-paper-deep flex items-center justify-center">
          <Tag className="w-7 h-7 text-primary" />
        </div>
        <div className="space-y-1.5">
          <h3 className="font-serif text-2xl text-foreground">
            No encontramos &ldquo;{query}&rdquo;
          </h3>
          <p className="text-muted-foreground">
            Probá con otro nombre — o agregalo a tu lista para que el barrio lo reporte.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={onGoToList}
          className="rounded-full border-border min-h-11"
        >
          Agregar a mi lista
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Profile-aware sponsored slot at the top of search results. Passes the user
 * query as keywords so campaigns with keyword targeting can match. Renders
 * nothing when no eligible campaign exists.
 */
function SponsoredSearchSlot({ query }: { query: string }) {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3);
  const { data } = trpc.campaigns.getForSurface.useQuery({
    surface: "sponsored_search",
    limit: 1,
    keywords,
  });
  const placement = data?.[0];
  if (!placement) return null;
  return <SponsoredCard placement={placement} variant="compact" position={0} />;
}
