import { useEffect, useMemo, useState } from "react";
import { useAnalytics } from "@/hooks/useAnalytics";
import { ANALYTICS_EVENTS } from "../../../shared/analytics";
import { SponsoredCard } from "@/components/SponsoredCard";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, ChefHat, ShoppingCart, Trash2,
  ExternalLink, Users, Loader2, Link2, BookOpen, Wand2,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

const EXAMPLE_SITES = ["cookpad", "ollaarrocera.cr", "recetasnestle", "youtube.com"];

interface Ingredient {
  name: string;
  quantity?: string;
  unit?: string;
  productId?: number;
}

function safeIngredients(value: unknown): Ingredient[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Ingredient => !!v && typeof v === "object" && typeof (v as any).name === "string");
}

function domainOf(url: string | null | undefined): string {
  if (!url) return "Sin enlace";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function Recipes() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [recipeUrl, setRecipeUrl] = useState("");
  const [previewRecipeId, setPreviewRecipeId] = useState<number | null>(null);
  const [listPickerForRecipe, setListPickerForRecipe] = useState<number | null>(null);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const { track } = useAnalytics();

  // Fire `recipe_viewed` when the preview modal opens for a recipe.
  useEffect(() => {
    if (!previewRecipeId) return;
    track(ANALYTICS_EVENTS.RECIPE_VIEWED, { recipeId: previewRecipeId });
  }, [previewRecipeId, track]);

  const utils = trpc.useUtils();
  const { data: recipes, isLoading } = trpc.recipes.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: lists } = trpc.lists.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const extractRecipe = trpc.recipes.extractFromUrl.useMutation({
    onSuccess: (data) => {
      utils.recipes.getAll.invalidate();
      setRecipeUrl("");
      toast.success(`"${data.name}" se guardó en tu recetario.`);
    },
    onError: (err) => toast.error(err.message),
  });

  const addToList = trpc.recipes.addToList.useMutation({
    onSuccess: (data) => {
      setListPickerForRecipe(null);
      setPreviewRecipeId(null);
      toast.success(`Recetario agregó ${data.itemsAdded} productos a tu lista.`);
      navigate("/lists");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteRecipe = trpc.recipes.delete.useMutation({
    onSuccess: () => {
      utils.recipes.getAll.invalidate();
      toast.success("Receta eliminada.");
    },
  });

  const previewRecipe = useMemo(
    () => recipes?.find((r) => r.id === previewRecipeId) ?? null,
    [recipes, previewRecipeId]
  );

  const handleConvert = () => {
    if (!recipeUrl) return;
    extractRecipe.mutate({ url: recipeUrl });
  };

  const handleConfirmAddToList = (recipeId: number) => {
    if (!selectedListId) {
      toast.error("Elegí una lista primero.");
      return;
    }
    addToList.mutate({ recipeId, listId: parseInt(selectedListId) });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/80 backdrop-blur sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" aria-label="Volver al inicio">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex flex-col leading-tight">
            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Tu semana
            </span>
            <span className="font-serif text-lg text-foreground">Recetario</span>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-4xl">
        <section className="mb-8">
          <h1 className="font-serif text-3xl md:text-4xl text-foreground tracking-tight">
            Recetario
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Pegá un link de una receta del internet — la pasamos a tu lista, lista para comprar.
          </p>
        </section>

        {/* Paste-link card */}
        <Card className="rounded-3xl shadow-paper border-border/60 mb-10">
          <CardContent className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Wand2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="font-serif text-xl">
                  Pegá la receta — <span className="italic text-primary">nosotros sacamos los ingredientes</span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  Funciona con la mayoría de sitios de cocina y videos.
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Pegá el link de tu receta…"
                  value={recipeUrl}
                  onChange={(e) => setRecipeUrl(e.target.value)}
                  className="pl-11 rounded-xl h-12"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && recipeUrl && !extractRecipe.isPending) {
                      handleConvert();
                    }
                  }}
                />
              </div>
              <Button
                onClick={handleConvert}
                disabled={!recipeUrl || extractRecipe.isPending}
                className="h-12 rounded-full px-6 gap-2 shrink-0"
              >
                {extractRecipe.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Leyendo receta…
                  </>
                ) : (
                  <>
                    <ChefHat className="w-4 h-4" /> Convertir a lista
                  </>
                )}
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="uppercase tracking-[0.14em]">Funciona con</span>
              {EXAMPLE_SITES.map((site) => (
                <span
                  key={site}
                  className="rounded-full bg-paper-deep px-3 py-1 font-mono text-[11px] text-foreground/70"
                >
                  {site}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Sponsored recipe placement (Fase 2) */}
        <SponsoredRecipeSlot />

        {/* Saved recipes */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-serif text-2xl">Recetas guardadas</h2>
            {recipes && recipes.length > 0 && (
              <span className="font-mono text-sm text-muted-foreground">
                {recipes.length} {recipes.length === 1 ? "receta" : "recetas"}
              </span>
            )}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : recipes && recipes.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recipes.map((recipe) => {
                const ingredients = safeIngredients(recipe.ingredients);
                return (
                  <Card
                    key={recipe.id}
                    className="rounded-3xl shadow-paper border-border/60 hover:-translate-y-0.5 transition-transform group"
                  >
                    <CardContent className="p-5 flex flex-col h-full">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <h3 className="font-serif text-lg leading-tight">
                          {recipe.name}
                        </h3>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 text-muted-foreground hover:text-destructive"
                              aria-label="Eliminar receta"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="font-serif text-2xl">
                                ¿Eliminar esta receta?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                "{recipe.name}" desaparece de tu recetario. No se puede deshacer.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deleteRecipe.mutate({ id: recipe.id })}
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>

                      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
                        <span className="font-mono">{domainOf(recipe.sourceUrl)}</span>
                        <span className="opacity-50">•</span>
                        <span>
                          <span className="font-mono">{ingredients.length}</span> ingredientes
                        </span>
                        {recipe.servings ? (
                          <>
                            <span className="opacity-50">•</span>
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              <span className="font-mono">{recipe.servings}</span>
                            </span>
                          </>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-1.5 mb-5">
                        {ingredients.slice(0, 4).map((ing, i) => (
                          <span
                            key={i}
                            className="text-xs px-2.5 py-1 rounded-full bg-peach-soft text-accent-foreground"
                          >
                            {ing.name}
                          </span>
                        ))}
                        {ingredients.length > 4 && (
                          <span className="text-xs px-2.5 py-1 rounded-full bg-paper-deep text-muted-foreground">
                            +{ingredients.length - 4} más
                          </span>
                        )}
                      </div>

                      <div className="mt-auto grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="rounded-full h-11 gap-1"
                          onClick={() => setPreviewRecipeId(recipe.id)}
                        >
                          <BookOpen className="w-4 h-4" /> Ver receta
                        </Button>
                        <Button
                          size="sm"
                          className="rounded-full h-11 gap-1"
                          onClick={() => {
                            setListPickerForRecipe(recipe.id);
                            setSelectedListId(lists?.[0]?.id?.toString() ?? "");
                          }}
                        >
                          <ShoppingCart className="w-4 h-4" /> Pasar a mi lista
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          ) : (
            <Card className="rounded-3xl shadow-paper border-border/60">
              <CardContent className="text-center py-14 px-6">
                <ChefHat className="w-12 h-12 mx-auto mb-4 text-muted-foreground/40" />
                <h3 className="font-serif text-2xl mb-2">
                  Tu recetario está empezando.
                </h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Pegá el link de la receta que querés cocinar esta semana — la convertimos en lista.
                </p>
                <Button
                  onClick={() => document.querySelector<HTMLInputElement>("input[placeholder^='Pegá el link']")?.focus()}
                  className="rounded-full h-11 px-5 gap-2"
                >
                  <Wand2 className="w-4 h-4" /> Pegar la primera
                </Button>
              </CardContent>
            </Card>
          )}
        </section>
      </main>

      {/* Preview modal */}
      <Dialog
        open={previewRecipeId !== null}
        onOpenChange={(open) => !open && setPreviewRecipeId(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">
              {previewRecipe?.name ?? "Receta"}
            </DialogTitle>
            <DialogDescription>
              {previewRecipe ? (
                <>
                  <span className="font-mono">{domainOf(previewRecipe.sourceUrl)}</span>
                  {previewRecipe.servings ? (
                    <>
                      <span className="mx-2 opacity-50">•</span>
                      Para <span className="font-mono">{previewRecipe.servings}</span> personas
                    </>
                  ) : null}
                </>
              ) : (
                "Detalle de la receta"
              )}
            </DialogDescription>
          </DialogHeader>
          {previewRecipe && (
            <div className="space-y-4">
              <div className="max-h-[50vh] overflow-y-auto pr-1">
                <ul className="space-y-2">
                  {safeIngredients(previewRecipe.ingredients).map((ing, i) => (
                    <li
                      key={i}
                      className="flex items-baseline justify-between gap-3 py-2 border-b border-dashed border-border last:border-0"
                    >
                      <span className="capitalize">{ing.name}</span>
                      {(ing.quantity || ing.unit) && (
                        <span className="font-serif italic text-muted-foreground text-sm shrink-0">
                          {ing.quantity ?? ""} {ing.unit ?? ""}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                {previewRecipe.sourceUrl && (
                  <a
                    href={previewRecipe.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="sm:flex-1"
                  >
                    <Button variant="outline" className="w-full rounded-full h-11 gap-1">
                      <ExternalLink className="w-4 h-4" /> Abrir original
                    </Button>
                  </a>
                )}
                <Button
                  className="sm:flex-1 rounded-full h-11 gap-1"
                  onClick={() => {
                    setListPickerForRecipe(previewRecipe.id);
                    setSelectedListId(lists?.[0]?.id?.toString() ?? "");
                  }}
                >
                  <ShoppingCart className="w-4 h-4" /> Pasar todo a mi lista
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* List picker modal */}
      <Dialog
        open={listPickerForRecipe !== null}
        onOpenChange={(open) => !open && setListPickerForRecipe(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">¿A qué lista lo agregamos?</DialogTitle>
            <DialogDescription>
              Elegí una de tus listas — los ingredientes se suman directamente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <Select value={selectedListId} onValueChange={setSelectedListId}>
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Elegí una lista…" />
              </SelectTrigger>
              <SelectContent>
                {lists?.map((list) => (
                  <SelectItem key={list.id} value={list.id.toString()}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              className="w-full h-11 rounded-full gap-2"
              onClick={() => listPickerForRecipe && handleConfirmAddToList(listPickerForRecipe)}
              disabled={!selectedListId || addToList.isPending}
            >
              {addToList.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Pasando ingredientes…
                </>
              ) : (
                <>
                  <ShoppingCart className="w-4 h-4" /> Agregar a esta lista
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Sponsored recipe placement — single card above the saved-recipes grid.
 * Renders nothing if no campaign matches the user's profile.
 */
function SponsoredRecipeSlot() {
  const { data } = trpc.campaigns.getForSurface.useQuery({
    surface: "recipe_sponsored",
    limit: 1,
  });
  const placement = data?.[0];
  if (!placement) return null;
  return (
    <section>
      <h2 className="font-serif text-2xl mb-4">Receta destacada</h2>
      <SponsoredCard placement={placement} variant="full" />
    </section>
  );
}
