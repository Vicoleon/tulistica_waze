import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { List, Plus, Users, ArrowLeft, ArrowRight, Trash2, Share2 } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function ShoppingLists() {
  const { isAuthenticated } = useAuth({ redirectOnUnauthenticated: true });
  const [newListName, setNewListName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showJoinDialog, setShowJoinDialog] = useState(false);

  const utils = trpc.useUtils();
  const { data: lists, isLoading } = trpc.lists.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createList = trpc.lists.create.useMutation({
    onSuccess: () => {
      utils.lists.getAll.invalidate();
      setNewListName("");
      setShowNewDialog(false);
      toast.success("Lista creada");
    },
  });

  const joinList = trpc.lists.joinByCode.useMutation({
    onSuccess: () => {
      utils.lists.getAll.invalidate();
      setJoinCode("");
      setShowJoinDialog(false);
      toast.success("Te uniste a la lista");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteList = trpc.lists.delete.useMutation({
    onSuccess: () => {
      utils.lists.getAll.invalidate();
      toast.success("Lista eliminada");
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" aria-label="Volver al tablero">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Mis listas</h1>
          <div className="ml-auto flex gap-2">
            <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Users className="w-4 h-4" /> Unirme
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Unirme a una lista compartida</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    placeholder="Código de invitación..."
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    onClick={() => joinList.mutate({ shareCode: joinCode })}
                    disabled={!joinCode || joinList.isPending}
                  >
                    Unirme
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="w-4 h-4" /> Nueva lista
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Crear nueva lista</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    placeholder="Ej. Compra del mes"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    onClick={() => createList.mutate({ name: newListName })}
                    disabled={!newListName || createList.isPending}
                  >
                    Crear lista
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
        ) : lists && lists.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lists.map((list) => (
              <Card key={list.id} className="hover:shadow-md transition-shadow group">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <List className="w-5 h-5 text-primary" />
                        {list.name}
                      </CardTitle>
                      <CardDescription>
                        {list.isShared ? (
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" /> Compartida
                          </span>
                        ) : (
                          "Personal"
                        )}
                      </CardDescription>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.preventDefault();
                        if (confirm("¿Eliminar esta lista?")) {
                          deleteList.mutate({ id: list.id });
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex gap-2">
                    <Link href={`/lists/${list.id}`} className="flex-1">
                      <Button variant="default" size="sm" className="w-full gap-1">
                        Abrir <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                    {!list.isShared && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toast.info("Compartir llegará pronto")}
                      >
                        <Share2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <List className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <h3 className="text-lg font-medium mb-2">Aún no tenés listas</h3>
            <p className="text-muted-foreground mb-4">
              Creá tu primera lista y empezá a llevar control de tus compras.
            </p>
            <Button onClick={() => setShowNewDialog(true)} className="gap-1">
              <Plus className="w-4 h-4" /> Crear lista
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
