import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { ArrowRight, ChevronRight, Leaf, Plus, ShoppingBasket, Trash2, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";

type ShoppingListSummary = {
  id: number;
  name: string;
  isShared: boolean | null;
  updatedAt?: string | Date | null;
  createdAt?: string | Date | null;
};

const ESTIMATED_TOTAL_PLACEHOLDER = 12400; // TODO: hook to estimated total
const ITEM_COUNT_PLACEHOLDER = 14; // TODO: hook to real item count per list

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short" }).format(date);
}

function formatColones(amount: number): string {
  return `₡ ${new Intl.NumberFormat("es-CR").format(Math.round(amount))}`;
}

export default function ShoppingLists() {
  const { isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  const [newListName, setNewListName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);

  const utils = trpc.useUtils();
  const { data: lists, isLoading } = trpc.lists.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createList = trpc.lists.create.useMutation({
    onSuccess: (data) => {
      utils.lists.getAll.invalidate();
      setNewListName("");
      setShowNewDialog(false);
      toast.success("Lista creada");
      if (data?.id) {
        setLocation(`/lists/${data.id}`);
      }
    },
  });

  const joinList = trpc.lists.joinByCode.useMutation({
    onSuccess: (data) => {
      utils.lists.getAll.invalidate();
      setJoinCode("");
      setShowJoinDialog(false);
      toast.success("Te uniste a la lista");
      if (data?.listId) {
        setLocation(`/lists/${data.listId}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteList = trpc.lists.delete.useMutation({
    onSuccess: () => {
      utils.lists.getAll.invalidate();
      toast.success("Lista eliminada");
    },
  });

  // TODO: pick active list properly — for now we treat the first list as the most recent.
  const typedLists = (lists ?? []) as ShoppingListSummary[];
  const activeList = typedLists[0];
  const otherLists = typedLists.slice(1);

  return (
    <div className="min-h-screen bg-background">
      <main className="container max-w-5xl py-10 sm:py-14">
        {/* Page header */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Mis listas
            </h1>
            <p className="mt-2 max-w-md font-serif italic text-muted-foreground">
              Donde vive tu lista del super.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-11 gap-2 rounded-full border-border px-5">
                  <Users className="h-4 w-4" /> Unirme con código
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-serif text-2xl">Unirme a una lista compartida</DialogTitle>
                  <DialogDescription>
                    Pegá el código que te pasó la persona que armó la lista.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    placeholder="Código de invitación…"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    className="h-12 rounded-xl"
                  />
                  <Button
                    className="h-12 w-full rounded-full"
                    onClick={() => joinList.mutate({ shareCode: joinCode })}
                    disabled={!joinCode || joinList.isPending}
                  >
                    {joinList.isPending ? "Uniéndote…" : "Unirme a la lista"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-11 gap-2 rounded-full bg-primary px-5 text-primary-foreground hover:bg-primary/90">
                  <Plus className="h-4 w-4" /> Nueva lista
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-serif text-2xl">Nueva lista</DialogTitle>
                  <DialogDescription>
                    Ponele un nombre que te ayude a reconocerla (por ejemplo: "Mandado del sábado").
                  </DialogDescription>
                </DialogHeader>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newListName.trim()) {
                      createList.mutate({ name: newListName.trim() });
                    }
                  }}
                  className="space-y-4 pt-4"
                >
                  <Input
                    placeholder="Nombre de la lista…"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    className="h-12 rounded-xl"
                    autoFocus
                  />
                  <Button
                    type="submit"
                    className="h-12 w-full rounded-full"
                    disabled={!newListName.trim() || createList.isPending}
                  >
                    {createList.isPending ? "Creando…" : "Crear lista"}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Content */}
        <section className="mt-10 space-y-10">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : activeList ? (
            <>
              {/* Active list — pinned */}
              <article className="relative overflow-hidden rounded-3xl border border-border bg-card p-7 shadow-paper transition-all duration-200 hover:-translate-y-0.5 hover:shadow-paper-lg sm:p-10">
                <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-peach-soft opacity-80" aria-hidden />
                <div className="absolute -bottom-12 -left-12 h-44 w-44 rounded-full bg-sage-soft opacity-70" aria-hidden />
                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-4">
                    <span className="inline-flex items-center gap-2 rounded-full bg-butter px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-butter-foreground">
                      <Leaf className="h-3.5 w-3.5" /> Tu lista de esta semana
                    </span>
                    <div>
                      <h2 className="font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
                        {activeList.name}
                      </h2>
                      <p className="mt-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                        Modificada {formatDate(activeList.updatedAt ?? activeList.createdAt)} ·{" "}
                        {ITEM_COUNT_PLACEHOLDER} productos
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <p className="font-serif italic text-sm text-muted-foreground">Estimado</p>
                        <p className="font-mono text-2xl font-semibold text-foreground">
                          {formatColones(ESTIMATED_TOTAL_PLACEHOLDER)}
                        </p>
                      </div>
                      {activeList.isShared ? (
                        <span className="inline-flex items-center gap-2 rounded-full bg-sage-soft px-3 py-1.5 text-xs font-medium text-secondary-foreground">
                          <Users className="h-3.5 w-3.5" /> Compartida
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row lg:flex-col lg:items-end">
                    <Link href={`/lists/${activeList.id}`}>
                      <Button
                        size="lg"
                        className="h-12 w-full gap-2 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90 sm:w-auto"
                      >
                        Abrir lista <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </div>
              </article>

              {/* Other lists */}
              {otherLists.length > 0 && (
                <div className="space-y-3">
                  <h3 className="px-1 font-serif italic text-sm uppercase tracking-[0.18em] text-muted-foreground">
                    Otras listas
                  </h3>
                  <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-paper">
                    {otherLists.map((list, index) => (
                      <div
                        key={list.id}
                        className={`group flex items-center gap-4 px-5 py-4 transition-colors duration-200 hover:bg-paper-deep sm:px-7 ${
                          index !== otherLists.length - 1 ? "border-b border-dashed border-border" : ""
                        }`}
                      >
                        <Link
                          href={`/lists/${list.id}`}
                          className="flex flex-1 items-center gap-4"
                        >
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-peach-soft text-accent-foreground">
                            <ShoppingBasket className="h-5 w-5" />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="truncate font-semibold text-foreground">{list.name}</p>
                            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                              {list.isShared ? "Compartida · " : ""}
                              {formatDate(list.updatedAt ?? list.createdAt)}
                            </p>
                          </div>
                          <ChevronRight className="hidden h-5 w-5 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 sm:block" />
                        </Link>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 rounded-full text-muted-foreground hover:bg-rose-soft hover:text-destructive"
                          onClick={() => {
                            if (confirm(`¿Eliminar "${list.name}"?`)) {
                              deleteList.mutate({ id: list.id });
                            }
                          }}
                          aria-label={`Eliminar ${list.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            // Empty state
            <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-16 text-center shadow-paper sm:px-10 sm:py-20">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-peach-soft">
                <ShoppingBasket className="h-10 w-10 text-accent-foreground" />
              </div>
              <h3 className="mt-6 font-serif text-2xl font-semibold tracking-tight text-foreground">
                Todavía no tenés lista.
              </h3>
              <p className="mt-2 font-serif italic text-muted-foreground">
                Crear una toma 10 segundos.
              </p>
              <Button
                size="lg"
                className="mt-8 h-12 gap-2 rounded-full bg-primary px-6 text-primary-foreground hover:bg-primary/90"
                onClick={() => setShowNewDialog(true)}
              >
                <Plus className="h-4 w-4" /> Crear mi primera lista
              </Button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
