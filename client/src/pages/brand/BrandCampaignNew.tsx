import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { BrandShell } from "./BrandShell";

type Surface =
  | "dashboard_promo"
  | "sponsored_search"
  | "recipe_sponsored";
type Tier = "value" | "mid" | "premium";
type Household = "1" | "2" | "3-4" | "5+";

const SURFACES: Array<{
  value: Surface;
  label: string;
  hint: string;
}> = [
  {
    value: "dashboard_promo",
    label: "Promoción en Dashboard",
    hint: "Tarjeta destacada en el side rail del usuario logueado.",
  },
  {
    value: "sponsored_search",
    label: "Búsqueda patrocinada",
    hint: "Slot arriba de resultados cuando alguien busca un producto.",
  },
  {
    value: "recipe_sponsored",
    label: "Receta patrocinada",
    hint: "Card destacada en el recetario.",
  },
];

const TIERS: Array<{ value: Tier; label: string; hint: string }> = [
  { value: "value", label: "Value", hint: "Palí, MaxiPalí, marca blanca." },
  { value: "mid", label: "Mid", hint: "Walmart, Más x Menos, Megasuper." },
  { value: "premium", label: "Premium", hint: "Auto Mercado, PriceSmart." },
];

const BASKET_MIX: Array<{ value: string; label: string }> = [
  { value: "frescos", label: "Frescos" },
  { value: "granos", label: "Granos y abarrotes" },
  { value: "procesados", label: "Procesados" },
  { value: "congelados", label: "Congelados" },
  { value: "snacks", label: "Snacks y bebidas" },
  { value: "saludable", label: "Saludable / orgánico" },
  { value: "limpieza", label: "Limpieza" },
];

const HOUSEHOLDS: Household[] = ["1", "2", "3-4", "5+"];

export default function BrandCampaignNew() {
  const [, navigate] = useLocation();
  const { data: brand, isLoading } = trpc.brand.me.useQuery();

  useEffect(() => {
    if (!isLoading && !brand) navigate("/brand/login");
  }, [brand, isLoading, navigate]);

  const utils = trpc.useUtils();
  const create = trpc.brandCampaigns.create.useMutation({
    onSuccess: async () => {
      await utils.brandCampaigns.getAll.invalidate();
      toast.success("Campaña creada. Empieza a servir en minutos.");
      navigate("/brand");
    },
    onError: (err) => toast.error(err.message),
  });

  const [surface, setSurface] = useState<Surface>("dashboard_promo");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [bidCpc, setBidCpc] = useState<string>("30");
  const [dailyBudget, setDailyBudget] = useState<string>("");
  const [maxImpsPerUser, setMaxImpsPerUser] = useState<string>("5");
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [basket, setBasket] = useState<string[]>([]);
  const [minHousehold, setMinHousehold] = useState<Household | "">("");

  const toggle = <T extends string>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const bidValue = Number(bidCpc);
    if (!Number.isFinite(bidValue) || bidValue < 0) {
      toast.error("Bid CPC inválido.");
      return;
    }
    if (title.trim().length < 2) {
      toast.error("El título debe tener al menos 2 caracteres.");
      return;
    }
    const dailyBudgetValue = dailyBudget ? Number(dailyBudget) : undefined;
    if (
      dailyBudgetValue !== undefined &&
      (!Number.isFinite(dailyBudgetValue) || dailyBudgetValue < 0)
    ) {
      toast.error("Presupuesto diario inválido.");
      return;
    }
    const capValue = maxImpsPerUser ? Number(maxImpsPerUser) : 5;
    if (!Number.isInteger(capValue) || capValue < 1 || capValue > 100) {
      toast.error("Tope de impresiones por usuario debe ser 1-100.");
      return;
    }
    create.mutate({
      type: surface,
      title: title.trim(),
      description: description.trim() || undefined,
      targetUrl: targetUrl.trim() || undefined,
      bidCpc: bidValue,
      dailyBudget: dailyBudgetValue,
      maxImpressionsPerUserPerDay: capValue,
      targetTiers: tiers.length > 0 ? tiers : undefined,
      targetBasketMix: basket.length > 0 ? basket : undefined,
      targetMinHouseholdSize: minHousehold || undefined,
    });
  };

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </main>
    );
  }
  if (!brand) return null;

  return (
    <BrandShell>
      <header className="mb-8">
        <button
          type="button"
          onClick={() => navigate("/brand")}
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Volver al dashboard
        </button>
        <h1 className="font-serif text-3xl sm:text-4xl tracking-tight">
          Nueva campaña
        </h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Elegí dónde aparecer, a quién, y cuánto pagás por click. Empezás
          a servir apenas la guardamos.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-6 max-w-3xl">
        {/* Surface */}
        <Card className="rounded-3xl border bg-card shadow-paper p-6 space-y-4">
          <div>
            <h2 className="font-serif text-xl mb-1">¿Dónde aparece?</h2>
            <p className="text-sm text-muted-foreground">
              Cada superficie tiene un comportamiento distinto.
            </p>
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            {SURFACES.map((s) => (
              <button
                type="button"
                key={s.value}
                onClick={() => setSurface(s.value)}
                className={cn(
                  "rounded-2xl border text-left p-4 transition-all",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  surface === s.value
                    ? "border-primary bg-primary/8 shadow-paper"
                    : "border-border bg-background hover:border-primary/40"
                )}
              >
                <p className="font-semibold leading-tight">{s.label}</p>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {s.hint}
                </p>
              </button>
            ))}
          </div>
        </Card>

        {/* Creative */}
        <Card className="rounded-3xl border bg-card shadow-paper p-6 space-y-4">
          <div>
            <h2 className="font-serif text-xl mb-1">El mensaje</h2>
            <p className="text-sm text-muted-foreground">
              Lo que va a leer la compradora. Etiquetamos siempre como
              "Patrocinado · {brand.name}".
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="title">Título</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ej. Frescos del día en Auto Mercado"
              maxLength={255}
              className="h-11 rounded-xl"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="description">Descripción (opcional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Una línea más para enganchar."
              maxLength={2000}
              rows={3}
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="targetUrl">URL al hacer click (opcional)</Label>
            <Input
              id="targetUrl"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://… o ruta interna /map?chain=…"
              maxLength={2000}
              className="h-11 rounded-xl"
            />
          </div>
        </Card>

        {/* Bid + budget */}
        <Card className="rounded-3xl border bg-card shadow-paper p-6 space-y-5">
          <div>
            <h2 className="font-serif text-xl mb-1">¿Cuánto pagás?</h2>
            <p className="text-sm text-muted-foreground">
              Cobramos por click. Empatás en targeting → gana quien ofrece más.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="bidCpc">Bid por click (CPC)</Label>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground">
                  ₡
                </span>
                <Input
                  id="bidCpc"
                  type="number"
                  min={0}
                  max={10000}
                  step="1"
                  value={bidCpc}
                  onChange={(e) => setBidCpc(e.target.value)}
                  className="h-11 rounded-xl font-mono text-lg"
                  required
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Promedio actual: <b>₡ 28</b> · recomendado: <b>₡ 25-40</b>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dailyBudget">Presupuesto diario (opcional)</Label>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-muted-foreground">
                  ₡
                </span>
                <Input
                  id="dailyBudget"
                  type="number"
                  min={0}
                  step="500"
                  placeholder="Sin tope"
                  value={dailyBudget}
                  onChange={(e) => setDailyBudget(e.target.value)}
                  className="h-11 rounded-xl font-mono text-lg"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Cuando se acabe, la campaña se pausa hasta mañana.
              </p>
            </div>
          </div>

          <div className="space-y-1.5 max-w-sm">
            <Label htmlFor="maxImps">
              Tope de impresiones por persona / día
            </Label>
            <Input
              id="maxImps"
              type="number"
              min={1}
              max={100}
              step="1"
              value={maxImpsPerUser}
              onChange={(e) => setMaxImpsPerUser(e.target.value)}
              className="h-11 rounded-xl font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Recomendado <b>3-5</b> para no quemar a la misma persona.
            </p>
          </div>
        </Card>

        {/* Targeting */}
        <Card className="rounded-3xl border bg-card shadow-paper p-6 space-y-5">
          <div>
            <h2 className="font-serif text-xl mb-1">¿A quién le servimos?</h2>
            <p className="text-sm text-muted-foreground">
              Dejá vacío para servir a todo el mundo. Cuanto más específico, menos
              gente ves — pero más relevante cada impresión.
            </p>
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">Tier</Label>
            <div className="flex flex-wrap gap-2">
              {TIERS.map((t) => (
                <Chip
                  key={t.value}
                  selected={tiers.includes(t.value)}
                  onClick={() => setTiers(toggle(tiers, t.value))}
                  label={t.label}
                  hint={t.hint}
                />
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">
              Mix de canasta
            </Label>
            <div className="flex flex-wrap gap-2">
              {BASKET_MIX.map((b) => (
                <Chip
                  key={b.value}
                  selected={basket.includes(b.value)}
                  onClick={() => setBasket(toggle(basket, b.value))}
                  label={b.label}
                />
              ))}
            </div>
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">
              Mínimo personas en el hogar
            </Label>
            <div className="flex flex-wrap gap-2">
              <Chip
                selected={!minHousehold}
                onClick={() => setMinHousehold("")}
                label="Cualquiera"
              />
              {HOUSEHOLDS.map((h) => (
                <Chip
                  key={h}
                  selected={minHousehold === h}
                  onClick={() => setMinHousehold(h)}
                  label={`≥ ${h}`}
                />
              ))}
            </div>
          </div>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate("/brand")}
            disabled={create.isPending}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            size="lg"
            disabled={create.isPending}
            className="rounded-full min-w-[200px]"
          >
            {create.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Lanzando…
              </>
            ) : (
              <>
                Lanzar campaña
                <ArrowRight className="w-4 h-4 ml-1" />
              </>
            )}
          </Button>
        </div>
      </form>
    </BrandShell>
  );
}

function Chip({
  selected,
  onClick,
  label,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint}
      className={cn(
        "rounded-full px-4 py-2 text-sm transition-all border",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        selected
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-background text-foreground border-border hover:border-primary/50"
      )}
    >
      {label}
    </button>
  );
}
