import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, ChefHat, Plus, Link2, ShoppingCart, Trash2,
  ExternalLink, Users, Loader2, Sparkles, Clock
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

const RECIPE_SUGGESTIONS = [
  "Gallo pinto tradicional",
  "Casado con pollo",
  "Olla de carne",
  "Arroz con pollo",
  "Sopa negra",
  "Picadillo de papa",
  "Tres leches",
];

export default function Recipes() {
  const { isAuthenticated } = useAuth();
  const [recipeUrl, setRecipeUrl] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>("");
  const [aiRequest, setAiRequest] = useState("");
  const [aiServings, setAiServings] = useState(4);
  const [usePantry, setUsePantry] = useState(true);

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
      setShowAddDialog(false);
      toast.success(`Receta "${data.name}" guardada`);
    },
    onError: (err) => toast.error(err.message),
  });

  const generateRecipe = trpc.recipes.generate.useMutation({
    onSuccess: (data) => {
      utils.recipes.getAll.invalidate();
      setAiRequest("");
      setShowAiDialog(false);
      toast.success(`Receta "${data.name}" generada`);
    },
    onError: (err) => toast.error(err.message),
  });

  const addToList = trpc.recipes.addToList.useMutation({
    onSuccess: (data) => {
      toast.success(`Se agregaron ${data.itemsAdded} ingredientes a la lista`);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteRecipe = trpc.recipes.delete.useMutation({
    onSuccess: () => {
      utils.recipes.getAll.invalidate();
      toast.success("Receta eliminada");
    },
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Mis recetas</h1>
          <div className="ml-auto flex gap-2">
            <Dialog open={showAiDialog} onOpenChange={setShowAiDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="default" className="gap-1 bg-accent hover:bg-accent/90 text-accent-foreground">
                  <Sparkles className="w-4 h-4" /> Generar con IA
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-accent" />
                    Generar receta con IA
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="ai-request">¿Qué querés cocinar?</Label>
                    <Textarea
                      id="ai-request"
                      placeholder="Ej. una sopa de pollo con ingredientes de la despensa, o pasta con marisco, o un postre fácil para 6 personas..."
                      value={aiRequest}
                      onChange={(e) => setAiRequest(e.target.value)}
                      rows={3}
                    />
                    <div className="flex flex-wrap gap-1.5">
                      {RECIPE_SUGGESTIONS.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setAiRequest(s)}
                          className="text-xs px-2 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ai-servings">Porciones</Label>
                    <Input
                      id="ai-servings"
                      type="number"
                      min={1}
                      max={20}
                      value={aiServings}
                      onChange={(e) => setAiServings(parseInt(e.target.value) || 4)}
                    />
                  </div>
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label htmlFor="use-pantry" className="text-sm font-medium cursor-pointer">
                        Usar mi despensa
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Personalizá la receta con lo que ya tenés.
                      </p>
                    </div>
                    <Switch
                      id="use-pantry"
                      checked={usePantry}
                      onCheckedChange={setUsePantry}
                    />
                  </div>
                  <Button
                    className="w-full gap-2"
                    onClick={() =>
                      generateRecipe.mutate({
                        request: aiRequest,
                        servings: aiServings,
                        usePantry,
                      })
                    }
                    disabled={aiRequest.trim().length < 3 || generateRecipe.isPending}
                  >
                    {generateRecipe.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Cocinando ideas...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        Generar receta
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="gap-1">
                  <Plus className="w-4 h-4" /> Importar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Importar receta desde URL</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Enlace a la receta</label>
                    <div className="relative">
                      <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="https://sitio.com/receta..."
                        value={recipeUrl}
                        onChange={(e) => setRecipeUrl(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Usamos IA para extraer los ingredientes de la página de la receta.
                  </p>
                  <Button
                    className="w-full gap-2"
                    onClick={() => extractRecipe.mutate({ url: recipeUrl })}
                    disabled={!recipeUrl || extractRecipe.isPending}
                  >
                    {extractRecipe.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Extrayendo...
                      </>
                    ) : (
                      <>
                        <ChefHat className="w-4 h-4" />
                        Importar
                      </>
                    )}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : recipes && recipes.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recipes.map((recipe) => {
              const ingredients = recipe.ingredients as any[] || [];
              return (
                <Card key={recipe.id} className="group">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg">{recipe.name}</CardTitle>
                          {recipe.isAiGenerated && (
                            <Badge variant="secondary" className="bg-accent/20 text-accent-foreground text-xs">
                              <Sparkles className="w-3 h-3 mr-1" /> IA
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="flex items-center gap-3 flex-wrap mt-1">
                          {recipe.servings && (
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" /> {recipe.servings} porciones
                            </span>
                          )}
                          {recipe.prepTimeMinutes && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {recipe.prepTimeMinutes} min
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => {
                          if (confirm("¿Eliminar esta receta?")) {
                            deleteRecipe.mutate({ id: recipe.id });
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {recipe.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {recipe.description}
                        </p>
                      )}
                      <div className="text-sm text-muted-foreground">
                        {ingredients.length} ingredientes
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {ingredients.slice(0, 5).map((ing, i) => (
                          <span
                            key={i}
                            className="text-xs px-2 py-1 rounded-full bg-muted"
                          >
                            {ing.name}
                          </span>
                        ))}
                        {ingredients.length > 5 && (
                          <span className="text-xs px-2 py-1 rounded-full bg-muted">
                            +{ingredients.length - 5} más
                          </span>
                        )}
                      </div>
                      {Array.isArray(recipe.steps) && recipe.steps.length > 0 && (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                            Ver pasos ({recipe.steps.length})
                          </summary>
                          <ol className="mt-2 space-y-1 list-decimal list-inside text-muted-foreground">
                            {recipe.steps.map((step, i) => (
                              <li key={i}>{step}</li>
                            ))}
                          </ol>
                        </details>
                      )}
                      <div className="flex gap-2 pt-2">
                        {recipe.sourceUrl && (
                          <a
                            href={recipe.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1"
                          >
                            <Button variant="outline" size="sm" className="w-full gap-1">
                              <ExternalLink className="w-4 h-4" /> Ver
                            </Button>
                          </a>
                        )}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" className="flex-1 gap-1">
                              <ShoppingCart className="w-4 h-4" /> A la lista
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Agregar a lista de compras</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                              <Select
                                value={selectedListId}
                                onValueChange={setSelectedListId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Elegí una lista..." />
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
                                className="w-full"
                                onClick={() => {
                                  if (selectedListId) {
                                    addToList.mutate({
                                      recipeId: recipe.id,
                                      listId: parseInt(selectedListId),
                                    });
                                  }
                                }}
                                disabled={!selectedListId || addToList.isPending}
                              >
                                Agregar {ingredients.length} ingredientes
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12">
            <ChefHat className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <h3 className="text-lg font-medium mb-2">Aún no guardaste recetas</h3>
            <p className="text-muted-foreground mb-4">
              Importá recetas de tus sitios favoritos y extraemos los ingredientes automáticamente.
            </p>
            <Button onClick={() => setShowAddDialog(true)} className="gap-1">
              <Plus className="w-4 h-4" /> Importar primera receta
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
