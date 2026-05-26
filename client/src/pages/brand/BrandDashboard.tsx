import { BrandLayout } from "@/components/BrandLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Megaphone, Receipt, Plus, TrendingUp } from "lucide-react";

function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default function BrandDashboard() {
  const { data: campaigns } = trpc.brandCampaigns.list.useQuery();
  const { data: invoices } = trpc.brandBilling.listInvoices.useQuery();

  const activeCount = campaigns?.filter(c => c.status === "active").length ?? 0;
  const totalImpressions = campaigns?.reduce((s, c) => s + (c.impressions ?? 0), 0) ?? 0;
  const totalClicks = campaigns?.reduce((s, c) => s + (c.clicks ?? 0), 0) ?? 0;
  const outstandingCents = invoices?.filter(i => i.status === "open").reduce((s, i) => s + i.totalCents, 0) ?? 0;

  return (
    <BrandLayout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Real-time snapshot of your campaigns and billing.
            </p>
          </div>
          <Link href="/brand/campaigns/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" /> New campaign
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active campaigns</CardDescription>
              <CardTitle className="text-3xl">{activeCount}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {campaigns?.length ?? 0} total
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Impressions (lifetime)</CardDescription>
              <CardTitle className="text-3xl">{totalImpressions.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">All campaigns</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Clicks (lifetime)</CardDescription>
              <CardTitle className="text-3xl">{totalClicks.toLocaleString()}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                CTR {totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0"}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Outstanding balance</CardDescription>
              <CardTitle className="text-3xl">{formatCents(outstandingCents)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Across open invoices</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="w-4 h-4" /> Recent campaigns
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!campaigns || campaigns.length === 0) ? (
                <p className="text-sm text-muted-foreground">
                  No campaigns yet.{" "}
                  <Link href="/brand/campaigns/new" className="text-primary hover:underline">
                    Create your first one
                  </Link>
                  .
                </p>
              ) : (
                <ul className="space-y-2">
                  {campaigns.slice(0, 5).map(c => (
                    <li key={c.id}>
                      <Link
                        href={`/brand/campaigns/${c.id}`}
                        className="flex items-center justify-between rounded-md p-2 hover:bg-muted"
                      >
                        <div>
                          <div className="font-medium text-sm">{c.name ?? c.title ?? `Campaign #${c.id}`}</div>
                          <div className="text-xs text-muted-foreground">
                            {c.status} · {(c.impressions ?? 0).toLocaleString()} imp · {(c.clicks ?? 0).toLocaleString()} clicks
                          </div>
                        </div>
                        <TrendingUp className="w-4 h-4 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-4 h-4" /> Recent invoices
              </CardTitle>
            </CardHeader>
            <CardContent>
              {(!invoices || invoices.length === 0) ? (
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
              ) : (
                <ul className="space-y-2">
                  {invoices.slice(0, 5).map(inv => (
                    <li
                      key={inv.id}
                      className="flex items-center justify-between rounded-md p-2 hover:bg-muted"
                    >
                      <div>
                        <div className="font-medium text-sm">{inv.periodMonth}</div>
                        <div className="text-xs text-muted-foreground">{inv.status}</div>
                      </div>
                      <div className="text-sm font-medium">{inv.totalFormatted}</div>
                    </li>
                  ))}
                </ul>
              )}
              <Link href="/brand/billing">
                <Button variant="link" size="sm" className="px-0 mt-2">
                  View all invoices →
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </BrandLayout>
  );
}
