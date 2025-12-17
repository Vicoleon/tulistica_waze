import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, ChefHat, Plus, Link2, ShoppingCart, Trash2,
  ExternalLink, Users, Loader2
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function Recipes() {
  const { isAuthenticated } = useAuth();
  const [recipeUrl, setRecipeUrl] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string>("");

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
      toast.success(`Recipe "${data.name}" saved!`);
    },
    onError: (err) => toast.error(err.message),
  });

  const addToList = trpc.recipes.addToList.useMutation({
    onSuccess: (data) => {
      toast.success(`Added ${data.itemsAdded} ingredients to list!`);
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteRecipe = trpc.recipes.delete.useMutation({
    onSuccess: () => {
      utils.recipes.getAll.invalidate();
      toast.success("Recipe deleted");
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
          <h1 className="text-xl font-bold">My Recipes</h1>
          <div className="ml-auto">
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="w-4 h-4" /> Import Recipe
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import Recipe from URL</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Recipe URL</label>
                    <div className="relative">
                      <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="https://example.com/recipe..."
                        value={recipeUrl}
                        onChange={(e) => setRecipeUrl(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    We'll use AI to extract ingredients from the recipe page
                  </p>
                  <Button
                    className="w-full gap-2"
                    onClick={() => extractRecipe.mutate({ url: recipeUrl })}
                    disabled={!recipeUrl || extractRecipe.isPending}
                  >
                    {extractRecipe.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Extracting...
                      </>
                    ) : (
                      <>
                        <ChefHat className="w-4 h-4" />
                        Import Recipe
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
                        <CardTitle className="text-lg">{recipe.name}</CardTitle>
                        {recipe.servings && (
                          <CardDescription className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {recipe.servings} servings
                          </CardDescription>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => {
                          if (confirm("Delete this recipe?")) {
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
                      <div className="text-sm text-muted-foreground">
                        {ingredients.length} ingredients
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
                            +{ingredients.length - 5} more
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 pt-2">
                        {recipe.sourceUrl && (
                          <a
                            href={recipe.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1"
                          >
                            <Button variant="outline" size="sm" className="w-full gap-1">
                              <ExternalLink className="w-4 h-4" /> View
                            </Button>
                          </a>
                        )}
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button size="sm" className="flex-1 gap-1">
                              <ShoppingCart className="w-4 h-4" /> Add to List
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Add to Shopping List</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4 pt-4">
                              <Select
                                value={selectedListId}
                                onValueChange={setSelectedListId}
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select a list..." />
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
                                Add {ingredients.length} Ingredients
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
            <h3 className="text-lg font-medium mb-2">No Saved Recipes</h3>
            <p className="text-muted-foreground mb-4">
              Import recipes from your favorite websites and we'll extract the ingredients
            </p>
            <Button onClick={() => setShowAddDialog(true)} className="gap-1">
              <Plus className="w-4 h-4" /> Import First Recipe
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
