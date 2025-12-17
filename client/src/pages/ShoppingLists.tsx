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
  const { isAuthenticated } = useAuth();
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
      toast.success("List created!");
    },
  });

  const joinList = trpc.lists.joinByCode.useMutation({
    onSuccess: () => {
      utils.lists.getAll.invalidate();
      setJoinCode("");
      setShowJoinDialog(false);
      toast.success("Joined list!");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteList = trpc.lists.delete.useMutation({
    onSuccess: () => {
      utils.lists.getAll.invalidate();
      toast.success("List deleted");
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
          <h1 className="text-xl font-bold">Shopping Lists</h1>
          <div className="ml-auto flex gap-2">
            <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1">
                  <Users className="w-4 h-4" /> Join List
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Join a Shared List</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    placeholder="Enter share code..."
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    onClick={() => joinList.mutate({ shareCode: joinCode })}
                    disabled={!joinCode || joinList.isPending}
                  >
                    Join List
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
            <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="w-4 h-4" /> New List
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create New List</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    placeholder="List name..."
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    onClick={() => createList.mutate({ name: newListName })}
                    disabled={!newListName || createList.isPending}
                  >
                    Create List
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
                            <Users className="w-3 h-3" /> Shared
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
                        if (confirm("Delete this list?")) {
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
                        Open <ArrowRight className="w-4 h-4" />
                      </Button>
                    </Link>
                    {!list.isShared && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toast.info("Share feature coming soon!")}
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
            <h3 className="text-lg font-medium mb-2">No Shopping Lists</h3>
            <p className="text-muted-foreground mb-4">
              Create your first list to start tracking your groceries
            </p>
            <Button onClick={() => setShowNewDialog(true)} className="gap-1">
              <Plus className="w-4 h-4" /> Create List
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
