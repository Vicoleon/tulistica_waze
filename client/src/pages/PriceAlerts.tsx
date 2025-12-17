import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import { Bell, BellOff, Plus, Trash2, TrendingDown, DollarSign, AlertCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

export default function PriceAlerts() {
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [targetPrice, setTargetPrice] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: alerts, isLoading, refetch } = trpc.priceAlerts.getAll.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: searchResults } = trpc.products.search.useQuery(
    { query: searchQuery, limit: 10 },
    { enabled: searchQuery.length > 2 }
  );

  const createAlert = trpc.priceAlerts.create.useMutation({
    onSuccess: () => {
      toast.success("Price alert created!");
      refetch();
      setIsAddDialogOpen(false);
      setSelectedProductId(null);
      setTargetPrice("");
      setSearchQuery("");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const updateAlert = trpc.priceAlerts.update.useMutation({
    onSuccess: () => {
      toast.success("Alert updated");
      refetch();
    },
  });

  const deleteAlert = trpc.priceAlerts.delete.useMutation({
    onSuccess: () => {
      toast.success("Alert deleted");
      refetch();
    },
  });

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
        <div className="container py-16 text-center">
          <Bell className="h-16 w-16 text-primary mx-auto mb-4" />
          <h1 className="text-3xl font-bold mb-4">Price Drop Alerts</h1>
          <p className="text-muted-foreground mb-8">
            Get notified when products you're watching drop below your target price.
          </p>
          <Button asChild size="lg">
            <a href={getLoginUrl()}>Sign In to Set Alerts</a>
          </Button>
        </div>
      </div>
    );
  }

  const handleCreateAlert = () => {
    if (!selectedProductId || !targetPrice) {
      toast.error("Please select a product and set a target price");
      return;
    }
    createAlert.mutate({
      productId: selectedProductId,
      targetPrice: parseFloat(targetPrice),
    });
  };

  const getCrowdednessColor = (level: number) => {
    if (level < 30) return "text-green-600";
    if (level < 60) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center">
              <Bell className="h-5 w-5 text-white" />
            </div>
            <span className="font-bold text-lg">Price Alerts</span>
          </Link>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </div>
      </header>

      <main className="container py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <Bell className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{alerts?.length || 0}</p>
                  <p className="text-sm text-muted-foreground">Active Alerts</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-green-100 rounded-full">
                  <TrendingDown className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {alerts?.filter(a => 
                      a.currentLowestPrice && a.currentLowestPrice <= a.targetPrice
                    ).length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Price Drops Found</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-100 rounded-full">
                  <DollarSign className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    ${alerts?.reduce((sum, a) => {
                      if (a.currentLowestPrice && a.currentLowestPrice < a.targetPrice) {
                        return sum + (a.targetPrice - a.currentLowestPrice);
                      }
                      return sum;
                    }, 0).toFixed(2) || "0.00"}
                  </p>
                  <p className="text-sm text-muted-foreground">Potential Savings</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Add Alert Button */}
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Your Price Alerts</h2>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Alert
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create Price Alert</DialogTitle>
                <DialogDescription>
                  Get notified when a product drops below your target price.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Search Product</Label>
                  <Input
                    placeholder="Search for a product..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                  {searchResults && searchResults.length > 0 && (
                    <div className="border rounded-lg max-h-48 overflow-y-auto">
                      {searchResults.map((product) => (
                        <button
                          key={product.id}
                          className={`w-full text-left px-3 py-2 hover:bg-muted transition-colors ${
                            selectedProductId === product.id ? "bg-primary/10" : ""
                          }`}
                          onClick={() => {
                            setSelectedProductId(product.id);
                            setSearchQuery(product.name);
                          }}
                        >
                          <p className="font-medium">{product.name}</p>
                          {product.brand && (
                            <p className="text-sm text-muted-foreground">{product.brand}</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Target Price ($)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 2.99"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    You'll be notified when the price drops below this amount.
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateAlert}
                  disabled={!selectedProductId || !targetPrice || createAlert.isPending}
                >
                  {createAlert.isPending ? "Creating..." : "Create Alert"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Alerts List */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : alerts && alerts.length > 0 ? (
          <div className="grid gap-4">
            {alerts.map((alert) => {
              const isPriceDropped = alert.currentLowestPrice && alert.currentLowestPrice <= alert.targetPrice;
              return (
                <Card key={alert.id} className={isPriceDropped ? "border-green-500 bg-green-50" : ""}>
                  <CardContent className="pt-6">
                    <div className="flex items-start justify-between">
                      <div className="flex gap-4">
                        {alert.productImageUrl ? (
                          <img
                            src={alert.productImageUrl}
                            alt={alert.productName || "Product"}
                            className="w-16 h-16 object-cover rounded-lg"
                          />
                        ) : (
                          <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center">
                            <DollarSign className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                        <div>
                          <h3 className="font-semibold">{alert.productName}</h3>
                          {alert.productBrand && (
                            <p className="text-sm text-muted-foreground">{alert.productBrand}</p>
                          )}
                          <div className="flex items-center gap-4 mt-2">
                            <div>
                              <p className="text-xs text-muted-foreground">Target</p>
                              <p className="font-bold text-primary">${alert.targetPrice.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Current Lowest</p>
                              <p className={`font-bold ${isPriceDropped ? "text-green-600" : ""}`}>
                                {alert.currentLowestPrice 
                                  ? `$${alert.currentLowestPrice.toFixed(2)}`
                                  : "N/A"}
                              </p>
                            </div>
                            {alert.storeName && (
                              <div>
                                <p className="text-xs text-muted-foreground">At</p>
                                <p className="text-sm">{alert.storeName}</p>
                              </div>
                            )}
                          </div>
                          {isPriceDropped && (
                            <div className="mt-2 flex items-center gap-2 text-green-600">
                              <TrendingDown className="h-4 w-4" />
                              <span className="text-sm font-medium">
                                Price dropped! Save ${(alert.targetPrice - (alert.currentLowestPrice || 0)).toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={alert.isActive ?? true}
                            onCheckedChange={(checked) => 
                              updateAlert.mutate({ id: alert.id, isActive: checked })
                            }
                          />
                          <span className="text-sm text-muted-foreground">
                            {alert.isActive ? "Active" : "Paused"}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteAlert.mutate({ id: alert.id })}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <BellOff className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Price Alerts Yet</h3>
              <p className="text-muted-foreground mb-4">
                Start tracking products to get notified when prices drop.
              </p>
              <Button onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Your First Alert
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Info Section */}
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              How Price Alerts Work
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-semibold mb-2">1. Set Your Target</h4>
                <p className="text-sm text-muted-foreground">
                  Choose a product and set the price you want to pay. We'll monitor prices across all stores.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">2. We Monitor Prices</h4>
                <p className="text-sm text-muted-foreground">
                  Our community reports prices daily. We track every update and compare against your target.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">3. Get Notified</h4>
                <p className="text-sm text-muted-foreground">
                  When the price drops below your target, you'll receive a notification with the store location.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
