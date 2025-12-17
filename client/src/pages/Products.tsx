import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Search, Barcode, Tag, TrendingDown, ArrowLeft, Plus, Star } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";

export default function Products() {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: products, isLoading } = trpc.products.search.useQuery(
    { query: searchQuery },
    { enabled: searchQuery.length > 2 }
  );

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
          <h1 className="text-xl font-bold">Search Products</h1>
          <div className="ml-auto">
            <Link href="/scanner">
              <Button variant="outline" size="sm" className="gap-2">
                <Barcode className="w-4 h-4" /> Scan Barcode
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {/* Search */}
        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search products by name, brand, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 h-12 text-lg"
          />
        </div>

        {/* Results */}
        {searchQuery.length < 3 ? (
          <div className="text-center py-12">
            <Search className="w-16 h-16 mx-auto mb-4 text-muted-foreground opacity-30" />
            <h3 className="text-lg font-medium mb-2">Search for Products</h3>
            <p className="text-muted-foreground">
              Enter at least 3 characters to search for products
            </p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
          </div>
        ) : products && products.length > 0 ? (
          <div className="space-y-4">
            {products.map((product: any) => (
              <Card key={product.id} className={`hover:shadow-md transition-shadow ${product.isSponsored ? 'border-accent' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-20 h-20 object-cover rounded-lg bg-muted"
                      />
                    ) : (
                      <div className="w-20 h-20 rounded-lg bg-muted flex items-center justify-center">
                        <Tag className="w-8 h-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-semibold truncate">{product.name}</h3>
                          {product.brand && (
                            <p className="text-sm text-muted-foreground">{product.brand}</p>
                          )}
                        </div>
                        {product.isSponsored && (
                          <Badge variant="secondary" className="bg-accent/20 text-accent-foreground">
                            <Star className="w-3 h-3 mr-1" /> Sponsored
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        {product.category && (
                          <Badge variant="outline">{product.category}</Badge>
                        )}
                        {product.barcode && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Barcode className="w-3 h-3" /> {product.barcode}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        <Button size="sm" variant="default" className="gap-1">
                          <TrendingDown className="w-4 h-4" /> Compare Prices
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => toast.success("Added to list!")}
                        >
                          <Plus className="w-4 h-4" /> Add to List
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Tag className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">No products found</h3>
            <p className="text-muted-foreground">
              Try a different search term or scan a barcode
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
