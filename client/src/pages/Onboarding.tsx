import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { useAnalytics } from "@/hooks/useAnalytics";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import { ANALYTICS_EVENTS } from "../../../shared/analytics";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Receipt,
  Sparkles,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  type BasketCategory,
  type HouseholdSize,
  type ShopperProfileInput,
  type ShoppingCadence,
  type ShoppingPriority,
  type StorePreference,
} from "../../../shared/profile";
import { useLocation } from "wouter";

// ============ Step content ============

type StepKey =
  | "household"
  | "cadence"
  | "chains"
  | "priorities"
  | "basket"
  | "bias";

const STEP_ORDER: StepKey[] = [
  "household",
  "cadence",
  "chains",
  "priorities",
  "basket",
  "bias",
];

const HOUSEHOLD_OPTIONS: Array<{ value: HouseholdSize; label: string }> = [
  { value: "1", label: "Vivo sola / solo" },
  { value: "2", label: "Somos 2" },
  { value: "3-4", label: "Somos 3 o 4" },
  { value: "5+", label: "Somos 5 o más" },
];

const CADENCE_OPTIONS: Array<{
  value: ShoppingCadence;
  label: string;
  hint: string;
}> = [
  { value: "weekly", label: "Cada semana", hint: "La compra fija del sábado" },
  { value: "biweekly", label: "Cada quince días", hint: "Compra grande" },
  { value: "monthly", label: "Una vez al mes", hint: "Despensa grande" },
  {
    value: "frequent",
    label: "Varias veces por semana",
    hint: "Compras pequeñas y frescas",
  },
];

const CHAIN_OPTIONS: Array<{ value: StorePreference; label: string }> = [
  { value: "walmart", label: "Walmart" },
  { value: "maxipali", label: "MaxiPalí" },
  { value: "pali", label: "Palí" },
  { value: "automercado", label: "Auto Mercado" },
  { value: "pricesmart", label: "PriceSmart" },
  { value: "masxmenos", label: "Más x Menos" },
  { value: "megasuper", label: "Megasuper" },
  { value: "ferias", label: "Ferias del agricultor" },
  { value: "pulperia", label: "Pulpería del barrio" },
  { value: "otra", label: "Otra" },
];

const PRIORITY_OPTIONS: Array<{
  value: ShoppingPriority;
  label: string;
  hint: string;
}> = [
  {
    value: "precio_bajo",
    label: "Precio bajo siempre",
    hint: "Que la canasta salga lo más barato posible.",
  },
  {
    value: "promociones",
    label: "Promociones y ofertas",
    hint: "Cazás las ofertas semanales.",
  },
  {
    value: "frescos",
    label: "Productos frescos y de calidad",
    hint: "Frutas, verduras y carnes que se vean bien.",
  },
  {
    value: "variedad",
    label: "Variedad de marcas",
    hint: "Que haya de dónde escoger.",
  },
  {
    value: "cercania",
    label: "Cercanía a mi casa",
    hint: "Que no quede lejos.",
  },
  {
    value: "por_mayor",
    label: "Comprar al por mayor",
    hint: "Tipo PriceSmart o Costco.",
  },
];

const BASKET_OPTIONS: Array<{
  value: BasketCategory;
  label: string;
  hint: string;
}> = [
  {
    value: "frescos",
    label: "Frescos",
    hint: "Frutas, verduras, carnes, lácteos.",
  },
  {
    value: "granos",
    label: "Granos y abarrotes",
    hint: "Arroz, frijol, aceite, azúcar.",
  },
  {
    value: "procesados",
    label: "Procesados",
    hint: "Enlatados, salsas, pastas.",
  },
  {
    value: "congelados",
    label: "Congelados",
    hint: "Comida lista para cocinar.",
  },
  {
    value: "snacks",
    label: "Snacks y bebidas",
    hint: "Galletas, refrescos, café.",
  },
  {
    value: "saludable",
    label: "Saludable u orgánico",
    hint: "Comida sin procesar, integrales.",
  },
  {
    value: "limpieza",
    label: "Limpieza y casa",
    hint: "Detergente, jabón, papel.",
  },
];

// ============ Page ============

type Draft = Partial<ShopperProfileInput>;

export default function Onboarding() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const update = trpc.profile.update.useMutation({
    onSuccess: (data) => {
      // Update the cached auth.me synchronously so the DashboardLayout gate
      // sees the completed onboarding immediately and doesn't bounce us back
      // here. We then fire-and-forget the invalidate to refetch in the
      // background and reconcile with the server's canonical version.
      utils.auth.me.setData(undefined, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          preferences: {
            ...(prev.preferences ?? {}),
            shopperProfile: data.shopperProfile,
          },
        };
      });
      void utils.auth.me.invalidate();
      toast.success("¡Listo! Vamos a tu primera lista.");
      navigate("/lists");
    },
    onError: (error) => {
      toast.error(error.message ?? "No pudimos guardar tu perfil.");
    },
  });

  const { track } = useAnalytics();
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState<Draft>({
    savingsVsTimeBias: 50,
  });
  const stepKey = STEP_ORDER[stepIndex];
  const isLast = stepIndex === STEP_ORDER.length - 1;

  // Fire `onboarding_started` once when the page first mounts.
  const startedRef = useRef(false);
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    track(ANALYTICS_EVENTS.ONBOARDING_STARTED);
  }, [track]);

  const firstName =
    (isAuthenticated && user?.name?.split(" ")[0]) || "amiga";

  const isStepValid = useMemo(() => {
    switch (stepKey) {
      case "household":
        return Boolean(draft.householdSize);
      case "cadence":
        return Boolean(draft.shoppingCadence);
      case "chains":
        return (draft.preferredChains?.length ?? 0) >= 1;
      case "priorities":
        return (
          (draft.shoppingPriorities?.length ?? 0) >= 1 &&
          (draft.shoppingPriorities?.length ?? 0) <= 3
        );
      case "basket":
        return (
          (draft.basketMix?.length ?? 0) >= 1 &&
          (draft.basketMix?.length ?? 0) <= 3
        );
      case "bias":
        return typeof draft.savingsVsTimeBias === "number";
    }
  }, [stepKey, draft]);

  const handleContinue = (e?: FormEvent) => {
    e?.preventDefault();
    if (!isStepValid) return;
    if (!isLast) {
      setStepIndex((s) => s + 1);
      return;
    }
    // Final: submit
    const payload = draft as ShopperProfileInput;
    update.mutate(payload);
  };

  const handleSkip = () => {
    track(ANALYTICS_EVENTS.ONBOARDING_SKIPPED, { stepReached: stepKey });
    navigate("/lists");
  };

  const handleBack = () => {
    if (stepIndex > 0) setStepIndex((s) => s - 1);
  };

  // Toggle multi-select with cap
  const toggleMulti = <T extends string>(
    list: T[] | undefined,
    value: T,
    max: number | null
  ): T[] => {
    const current = list ?? [];
    if (current.includes(value)) {
      return current.filter((v) => v !== value);
    }
    if (max && current.length >= max) {
      toast.info(`Solo podés elegir hasta ${max}.`);
      return current;
    }
    return [...current, value];
  };

  return (
    <main className="min-h-screen bg-background flex flex-col">
      {/* Top bar: brand + skip */}
      <header className="flex items-center justify-between px-5 sm:px-8 py-5">
        <div className="flex items-center gap-2.5">
          <span
            className="w-7 h-7 rounded-full bg-primary/15 text-primary grid place-items-center"
            aria-hidden="true"
          >
            <Receipt className="w-4 h-4" />
          </span>
          <span className="font-serif font-semibold text-base tracking-tight">
            tulistica
          </span>
        </div>
        <button
          type="button"
          onClick={handleSkip}
          className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground hover:text-foreground transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary px-2 py-1"
          aria-label="Saltear por ahora y volver más tarde"
        >
          Saltear por ahora →
        </button>
      </header>

      {/* Progress dots */}
      <div
        className="flex items-center justify-center gap-2 pb-4"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={STEP_ORDER.length}
        aria-valuenow={stepIndex + 1}
        aria-label={`Pregunta ${stepIndex + 1} de ${STEP_ORDER.length}`}
      >
        {STEP_ORDER.map((key, i) => (
          <span
            key={key}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              i === stepIndex
                ? "w-8 bg-primary"
                : i < stepIndex
                ? "w-1.5 bg-primary/60"
                : "w-1.5 bg-border"
            )}
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Content */}
      <form
        onSubmit={handleContinue}
        className="flex-1 flex items-start sm:items-center justify-center px-5 sm:px-8 pb-8"
      >
        <div className="w-full max-w-2xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-3">
            Pregunta {stepIndex + 1} de {STEP_ORDER.length}
          </p>

          {/* Each step */}
          {stepKey === "household" && (
            <Step
              question={
                <>
                  ¿Cuántas personas viven en tu{" "}
                  <em className="font-serif italic text-primary">casa</em>?
                </>
              }
              hint="Lo usamos para sugerirte recetas y cantidades."
            >
              <div className="grid sm:grid-cols-2 gap-3">
                {HOUSEHOLD_OPTIONS.map((opt) => (
                  <SelectCard
                    key={opt.value}
                    label={opt.label}
                    selected={draft.householdSize === opt.value}
                    onClick={() =>
                      setDraft((d) => ({ ...d, householdSize: opt.value }))
                    }
                  />
                ))}
              </div>
            </Step>
          )}

          {stepKey === "cadence" && (
            <Step
              question={
                <>
                  ¿Cada cuánto{" "}
                  <em className="font-serif italic text-primary">vas al super</em>?
                </>
              }
              hint="Para saber cuándo recordarte lo que falta."
            >
              <div className="grid sm:grid-cols-2 gap-3">
                {CADENCE_OPTIONS.map((opt) => (
                  <SelectCard
                    key={opt.value}
                    label={opt.label}
                    hint={opt.hint}
                    selected={draft.shoppingCadence === opt.value}
                    onClick={() =>
                      setDraft((d) => ({ ...d, shoppingCadence: opt.value }))
                    }
                  />
                ))}
              </div>
            </Step>
          )}

          {stepKey === "chains" && (
            <Step
              question={
                <>
                  ¿Dónde solés{" "}
                  <em className="font-serif italic text-primary">hacer compras</em>?
                </>
              }
              hint="Marcá todas las que aplican. Te mostramos primero las tuyas."
            >
              <div className="grid sm:grid-cols-2 gap-3">
                {CHAIN_OPTIONS.map((opt) => (
                  <SelectCard
                    key={opt.value}
                    label={opt.label}
                    selected={Boolean(
                      draft.preferredChains?.includes(opt.value)
                    )}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        preferredChains: toggleMulti(
                          d.preferredChains,
                          opt.value,
                          null
                        ),
                      }))
                    }
                  />
                ))}
              </div>
            </Step>
          )}

          {stepKey === "priorities" && (
            <Step
              question={
                <>
                  ¿Qué es lo más importante para vos al{" "}
                  <em className="font-serif italic text-primary">
                    elegir tienda
                  </em>
                  ?
                </>
              }
              hint={`Marcá hasta 3 (${draft.shoppingPriorities?.length ?? 0}/3).`}
            >
              <div className="grid sm:grid-cols-2 gap-3">
                {PRIORITY_OPTIONS.map((opt) => (
                  <SelectCard
                    key={opt.value}
                    label={opt.label}
                    hint={opt.hint}
                    selected={Boolean(
                      draft.shoppingPriorities?.includes(opt.value)
                    )}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        shoppingPriorities: toggleMulti(
                          d.shoppingPriorities,
                          opt.value,
                          3
                        ),
                      }))
                    }
                  />
                ))}
              </div>
            </Step>
          )}

          {stepKey === "basket" && (
            <Step
              question={
                <>
                  ¿Qué{" "}
                  <em className="font-serif italic text-primary">llena más</em>{" "}
                  tu carrito?
                </>
              }
              hint={`Marcá hasta 3 (${draft.basketMix?.length ?? 0}/3).`}
            >
              <div className="grid sm:grid-cols-2 gap-3">
                {BASKET_OPTIONS.map((opt) => (
                  <SelectCard
                    key={opt.value}
                    label={opt.label}
                    hint={opt.hint}
                    selected={Boolean(draft.basketMix?.includes(opt.value))}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        basketMix: toggleMulti(d.basketMix, opt.value, 3),
                      }))
                    }
                  />
                ))}
              </div>
            </Step>
          )}

          {stepKey === "bias" && (
            <Step
              question={
                <>
                  ¿Qué te importa más al{" "}
                  <em className="font-serif italic text-primary">comprar</em>?
                </>
              }
              hint="Movélo hasta donde mejor te describa."
            >
              <div className="rounded-3xl border bg-card p-6 sm:p-8 shadow-paper">
                <div className="flex items-center justify-between mb-3 text-sm font-medium">
                  <span className="text-foreground">Ahorrar todo</span>
                  <span className="text-muted-foreground">Tiempo y cerca</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={draft.savingsVsTimeBias ?? 50}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      savingsVsTimeBias: Number(e.target.value),
                    }))
                  }
                  className={cn(
                    "w-full h-2 rounded-full appearance-none bg-gradient-to-r from-secondary via-butter to-accent",
                    "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-6 [&::-webkit-slider-thumb]:h-6",
                    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary",
                    "[&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-background",
                    "[&::-webkit-slider-thumb]:shadow-paper [&::-webkit-slider-thumb]:cursor-pointer",
                    "[&::-moz-range-thumb]:w-6 [&::-moz-range-thumb]:h-6 [&::-moz-range-thumb]:rounded-full",
                    "[&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-background",
                    "[&::-moz-range-thumb]:cursor-pointer"
                  )}
                  aria-label="Sesgo entre ahorro y tiempo"
                />
                <p className="mt-6 text-center font-serif text-xl italic text-muted-foreground">
                  {biasLabel(draft.savingsVsTimeBias ?? 50, firstName)}
                </p>
              </div>
            </Step>
          )}

          {/* Footer actions */}
          <div className="mt-10 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              disabled={stepIndex === 0 || update.isPending}
              className="text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Atrás
            </Button>

            <Button
              type="submit"
              size="lg"
              disabled={!isStepValid || update.isPending}
              className="min-w-[160px] rounded-full"
            >
              {update.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Guardando…
                </>
              ) : isLast ? (
                <>
                  <Sparkles className="h-4 w-4 mr-1.5" />
                  Listo
                </>
              ) : (
                <>
                  Continuar
                  <ArrowRight className="h-4 w-4 ml-1" />
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}

// ============ Sub-components ============

interface StepProps {
  question: React.ReactNode;
  hint: string;
  children: React.ReactNode;
}

function Step({ question, hint, children }: StepProps) {
  return (
    <>
      <h1 className="font-serif font-medium text-3xl sm:text-4xl tracking-tight leading-[1.1] mb-3 max-w-[28ch]">
        {question}
      </h1>
      <p className="text-muted-foreground mb-7 sm:mb-8 max-w-xl">{hint}</p>
      {children}
    </>
  );
}

interface SelectCardProps {
  label: string;
  hint?: string;
  selected: boolean;
  onClick: () => void;
}

function SelectCard({ label, hint, selected, onClick }: SelectCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative text-left rounded-2xl border px-4 py-4 sm:py-5 transition-all min-h-[60px]",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        selected
          ? "bg-primary/8 border-primary shadow-paper"
          : "bg-card border-border hover:border-primary/40 hover:-translate-y-0.5"
      )}
      aria-pressed={selected}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
            selected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-muted-foreground/40 bg-background"
          )}
          aria-hidden="true"
        >
          {selected ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
        </span>
        <span className="flex-1 min-w-0">
          <span
            className={cn(
              "block font-medium leading-tight",
              selected ? "text-foreground" : "text-foreground"
            )}
          >
            {label}
          </span>
          {hint ? (
            <span className="block text-[13px] text-muted-foreground mt-1 leading-snug">
              {hint}
            </span>
          ) : null}
        </span>
      </div>
    </button>
  );
}

function biasLabel(bias: number, firstName: string): string {
  if (bias <= 15) return `"Cazo la oferta donde sea, ${firstName}."`;
  if (bias <= 35) return `"Me importa más el bolsillo que el tiempo."`;
  if (bias <= 55) return `"Algo del medio — ahorro pero sin sufrir."`;
  if (bias <= 75) return `"Más bien rápido. El tiempo también vale."`;
  return `"Que sea rápido y cerca, aunque pague un poco más."`;
}
