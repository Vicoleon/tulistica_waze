import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, Package, Plus, Bell, BellOff, AlertTriangle,
  ShoppingCart, Clock, Trash2
} from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function Pantry() {
  const { isAuthenticated } = useAuth();
  const [newItemName, setNewItemName] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const utils = trpc.useUtils();
  const { data: pantryItems, isLoading } = trpc.pantry.getAll.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: restockSuggestions } = trpc.pantry.getRestockSuggestions.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const addItem = trpc.pantry.add.useMutation({
    onSuccess: () => {
      utils.pantry.getAll.invalidate();
      setNewItemName("");
      setShowAddDialog(false);
      toast.success("Item added to pantry!");
    },
  });

  const updateItem = trpc.pantry.update.useMutation({
    onSuccess: () => {
      utils.pantry.getAll.invalidate();
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
          <h1 className="text-xl font-bold">My Pantry</h1>
          <div className="ml-auto">
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1">
                  <Plus className="w-4 h-4" /> Add Item
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Pantry Item</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <Input
                    placeholder="Item name..."
                    value={newItemName}
                    onChange={(e) => setNewItemName(e.target.value)}
                  />
                  <Button
                    className="w-full"
                    onClick={() => addItem.mutate({ customName: newItemName })}
                    disabled={!newItemName || addItem.isPending}
                  >
                    Add to Pantry
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* Restock Suggestions */}
        {restockSuggestions && restockSuggestions.length > 0 && (
          <Card className="mb-6 border-accent">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-accent-foreground">
                <AlertTriangle className="w-5 h-5" />
                Restock Suggestions
              </CardTitle>
              <CardDescription>
                Based on your purchase patterns, you might need these soon
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {restockSuggestions.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-accent/10"
                  >
                    <div>
                      <div className="font-medium">{item.productName || item.customName}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last bought {item.daysSinceLastPurchase} days ago
                        (usually every {Math.round(item.avgDaysBetweenPurchases || 7)} days)
                      </div>
                    </div>
                    <Button size="sm" variant="outline" className="gap-1">
                      <ShoppingCart className="w-4 h-4" /> Add to List
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Pantry Items */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : pantryItems && pantryItems.length > 0 ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">All Items ({pantryItems.length})</h2>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {pantryItems.map((item) => (
                <Card key={item.id} className="group">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium">{item.productName || item.customName}</h3>
                        {item.productCategory && (
                          <Badge variant="secondary" className="mt-1">
                            {item.productCategory}
                          </Badge>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="opacity-0 group-hover:opacity-100"
                        onClick={() =>
                          updateItem.mutate({
                            id: item.id,
                            notifyWhenLow: !item.notifyWhenLow,
                          })
                        }
                      >
                        {item.notifyWhenLow ? (
                          <Bell className="w-4 h-4 text-primary" />
                        ) : (
                          <BellOff className="w-4 h-4 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between">
                        <span>Quantity</span>
                        <span className="font-medium text-foreground">{item.quantity}</span>
                      </div>
                      {item.lastPurchasedAt && (
                        <div className="flex items-center justify-between">
                          <span>Last bought</span>
                          <span>
                            {new Date(item.lastPurchasedAt).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      {item.avgDaysBetweenPurchases && (
                        <div className="flex items-center justify-between">
                          <span>Avg. cycle</span>
                          <span>{Math.round(item.avgDaysBetweenPurchases)} days</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <h3 className="text-lg font-medium mb-2">Your Pantry is Empty</h3>
            <p className="text-muted-foreground mb-4">
              Add items to track your inventory and get smart restock reminders
            </p>
            <Button onClick={() => setShowAddDialog(true)} className="gap-1">
              <Plus className="w-4 h-4" /> Add First Item
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
