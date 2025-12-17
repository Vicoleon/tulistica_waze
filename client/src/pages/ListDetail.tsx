import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Plus, Users, Share2, Copy, TrendingDown, Trash2,
  ShoppingCart, Check, Search, Package
} from "lucide-react";
import { Link, useParams } from "wouter";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";

export default function ListDetail() {
  const { id } = useParams<{ id: string }>();
  const listId = parseInt(id || "0");
  const { user } = useAuth();
  const [newItemName, setNewItemName] = useState("");
  const [socket, setSocket] = useState<Socket | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const utils = trpc.useUtils();
  const { data: list, isLoading } = trpc.lists.getById.useQuery(
    { id: listId },
    { enabled: listId > 0 }
  );

  // Search products as user types
  const { data: searchResults } = trpc.products.search.useQuery(
    { query: newItemName, limit: 5 },
    { enabled: newItemName.length >= 2 && !selectedProduct }
  );

  const addItem = trpc.lists.addItem.useMutation({
    onSuccess: () => {
      utils.lists.getById.invalidate({ id: listId });
      setNewItemName("");
      setSelectedProduct(null);
      setShowProductSearch(false);
      socket?.emit("list_update", {
        listId,
        action: "item_added",
        userId: user?.id,
        userName: user?.name,
      });
    },
  });

  const checkItem = trpc.lists.checkItem.useMutation({
    onMutate: async ({ id: itemId, isChecked }) => {
      await utils.lists.getById.cancel({ id: listId });
      const prev = utils.lists.getById.getData({ id: listId });
      if (prev) {
        utils.lists.getById.setData({ id: listId }, {
          ...prev,
          items: prev.items.map((item) =>
            item.id === itemId ? { ...item, isChecked } : item
          ),
        });
      }
      return { prev };
    },
    onError: (_, __, ctx) => {
      if (ctx?.prev) utils.lists.getById.setData({ id: listId }, ctx.prev);
    },
    onSuccess: (_, { id: itemId, isChecked }) => {
      socket?.emit("list_update", {
        listId,
        action: "item_checked",
        itemId,
        userId: user?.id,
        userName: user?.name,
        data: { isChecked },
      });
    },
  });

  const removeItem = trpc.lists.removeItem.useMutation({
    onSuccess: (_, { id: itemId }) => {
      utils.lists.getById.invalidate({ id: listId });
      socket?.emit("list_update", {
        listId,
        action: "item_removed",
        itemId,
        userId: user?.id,
        userName: user?.name,
      });
    },
  });

  const updateList = trpc.lists.update.useMutation({
    onSuccess: (data) => {
      utils.lists.getById.invalidate({ id: listId });
      if (data?.shareCode) {
        toast.success("List is now shared!");
      }
    },
  });

  // WebSocket connection for real-time updates
  useEffect(() => {
    const socketInstance = io({
      path: "/api/socket.io",
    });

    socketInstance.on("connect", () => {
      socketInstance.emit("join_list", listId);
    });

    socketInstance.on("list_update", (update) => {
      if (update.userId !== user?.id) {
        utils.lists.getById.invalidate({ id: listId });
        toast.info(`${update.userName || "Someone"} updated the list`);
      }
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.emit("leave_list", listId);
      socketInstance.disconnect();
    };
  }, [listId, user?.id]);

  const copyShareCode = () => {
    if (list?.shareCode) {
      navigator.clipboard.writeText(list.shareCode);
      toast.success("Share code copied!");
    }
  };

  const handleAddItem = () => {
    if (selectedProduct) {
      // Add with productId for optimization
      addItem.mutate({ listId, productId: selectedProduct.id, customName: selectedProduct.name });
    } else if (newItemName.trim()) {
      // Add as custom item (won't be optimizable)
      addItem.mutate({ listId, customName: newItemName.trim() });
    }
  };

  const selectProduct = (product: { id: number; name: string }) => {
    setSelectedProduct(product);
    setNewItemName(product.name);
    setShowProductSearch(false);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!list) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2">List not found</h2>
          <Link href="/lists">
            <Button>Back to Lists</Button>
          </Link>
        </div>
      </div>
    );
  }

  const uncheckedItems = list.items.filter((item) => !item.isChecked);
  const checkedItems = list.items.filter((item) => item.isChecked);
  const hasProducts = searchResults && searchResults.length > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/lists">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{list.name}</h1>
            {list.isShared && (
              <div className="flex items-center gap-1 text-sm text-muted-foreground">
                <Users className="w-3 h-3" />
                <span>{list.members.length + 1} members</span>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {list.isShared ? (
              <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1">
                    <Share2 className="w-4 h-4" /> Share
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Share This List</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-4">
                    <div className="flex items-center gap-2">
                      <Input value={list.shareCode || ""} readOnly />
                      <Button onClick={copyShareCode}>
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Share this code with others to let them join your list
                    </p>
                  </div>
                </DialogContent>
              </Dialog>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={() => updateList.mutate({ id: listId, isShared: true })}
              >
                <Share2 className="w-4 h-4" /> Enable Sharing
              </Button>
            )}
            <Link href={`/optimize?list=${listId}`}>
              <Button size="sm" className="gap-1">
                <TrendingDown className="w-4 h-4" /> Optimize
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-2xl">
        {/* Add Item */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="relative">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAddItem();
                }}
                className="flex gap-2"
              >
                <div className="flex-1 relative">
                  <Input
                    ref={inputRef}
                    placeholder="Search products or add custom item..."
                    value={newItemName}
                    onChange={(e) => {
                      setNewItemName(e.target.value);
                      setSelectedProduct(null);
                      setShowProductSearch(true);
                    }}
                    onFocus={() => setShowProductSearch(true)}
                    className={selectedProduct ? "pr-20" : ""}
                  />
                  {selectedProduct && (
                    <Badge className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary">
                      <Package className="w-3 h-3 mr-1" /> Linked
                    </Badge>
                  )}
                </div>
                <Button type="submit" disabled={!newItemName.trim() || addItem.isPending}>
                  <Plus className="w-4 h-4" />
                </Button>
              </form>
              
              {/* Product Search Dropdown */}
              {showProductSearch && hasProducts && newItemName.length >= 2 && !selectedProduct && (
                <div className="absolute top-full left-0 right-12 mt-1 bg-card border rounded-lg shadow-lg z-50 overflow-hidden">
                  <div className="p-2 border-b bg-muted/50">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Search className="w-3 h-3" /> Select a product for price optimization
                    </p>
                  </div>
                  {searchResults.map((product) => (
                    <button
                      key={product.id}
                      type="button"
                      className="w-full px-3 py-2 text-left hover:bg-muted flex items-center gap-3 transition-colors"
                      onClick={() => selectProduct(product)}
                    >
                      <Package className="w-4 h-4 text-primary" />
                      <div className="flex-1">
                        <div className="font-medium">{product.name}</div>
                        {product.brand && (
                          <div className="text-xs text-muted-foreground">{product.brand}</div>
                        )}
                      </div>
                      {product.category && (
                        <Badge variant="secondary" className="text-xs">{product.category}</Badge>
                      )}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="w-full px-3 py-2 text-left hover:bg-muted border-t text-sm text-muted-foreground"
                    onClick={() => {
                      setShowProductSearch(false);
                    }}
                  >
                    Add "{newItemName}" as custom item (won't be optimized)
                  </button>
                </div>
              )}
            </div>
            {!selectedProduct && newItemName.length >= 2 && (
              <p className="text-xs text-muted-foreground mt-2">
                💡 Tip: Select a product from the list to enable price optimization
              </p>
            )}
          </CardContent>
        </Card>

        {/* Items List */}
        {list.items.length === 0 ? (
          <div className="text-center py-12">
            <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <h3 className="text-lg font-medium mb-2">Your list is empty</h3>
            <p className="text-muted-foreground">Add items to get started</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Unchecked Items */}
            {uncheckedItems.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground">
                  To Buy ({uncheckedItems.length})
                </h3>
                {uncheckedItems.map((item) => (
                  <Card key={item.id} className="group">
                    <CardContent className="p-3 flex items-center gap-3">
                      <Checkbox
                        checked={item.isChecked ?? false}
                        onCheckedChange={(checked) =>
                          checkItem.mutate({ id: item.id, isChecked: !!checked })
                        }
                      />
                      <div className="flex-1">
                        <span className="font-medium">
                          {item.productName || item.customName}
                        </span>
                        {item.quantity && item.quantity > 1 && (
                          <Badge variant="secondary" className="ml-2">
                            x{item.quantity}
                          </Badge>
                        )}
                        {item.productId && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            <Package className="w-3 h-3 mr-1" /> Optimizable
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => removeItem.mutate({ id: item.id })}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Checked Items */}
            {checkedItems.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <Check className="w-4 h-4" /> Done ({checkedItems.length})
                </h3>
                {checkedItems.map((item) => (
                  <Card key={item.id} className="group opacity-60">
                    <CardContent className="p-3 flex items-center gap-3">
                      <Checkbox
                        checked={item.isChecked ?? false}
                        onCheckedChange={(checked) =>
                          checkItem.mutate({ id: item.id, isChecked: !!checked })
                        }
                      />
                      <div className="flex-1">
                        <span className="line-through">
                          {item.productName || item.customName}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() => removeItem.mutate({ id: item.id })}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
