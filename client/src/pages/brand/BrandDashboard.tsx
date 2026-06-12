import { BrandLayout } from "@/components/BrandLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Megaphone, Receipt, Plus, TrendingUp } from "lucide-react";
import {
  campaignStatusLabel,
  invoiceStatusLabel,
  formatPeriodMonth,
} from "./labels";

function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default function BrandDashboard() {
  const { data: campaigns, isLoading: loadingCampaigns } = trpc.brandCampaigns.list.useQuery();
  const { data: invoices, isLoading: loadingInvoices } = trpc.brandBilling.listInvoices.useQuery();

  const activeCount = campaigns?.filter(c => c.status === "active").length ?? 0;
  const totalImpressions = campaigns?.reduce((s, c) => s + (c.impressions ?? 0), 0) ?? 0;
  const totalClicks = campaigns?.reduce((s, c) => s + (c.clicks ?? 0), 0) ?? 0;
  const outstandingCents = invoices?.filter(i => i.status === "open").reduce((s, i) => s + i.totalCents, 0) ?? 0;

  return (
    <BrandLayout>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Panel</h1>
            <p className="text-sm text-muted-foreground">
              Resumen en tiempo real de tus campañas y facturación.
            </p>
          </div>
          <Button asChild>
            <Link href="/brand/campaigns/new">
              <Plus className="w-4 h-4 mr-2" /> Nueva campaña
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Campañas activas</CardDescription>
              {loadingCampaigns ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <CardTitle className="text-3xl">{activeCount}</CardTitle>
              )}
            </CardHeader>
            <CardContent>
              {loadingCampaigns ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {campaigns?.length ?? 0} en total
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Impresiones (históricas)</CardDescription>
              {loadingCampaigns ? (
                <Skeleton className="h-9 w-24" />
              ) : (
                <CardTitle className="text-3xl">{totalImpressions.toLocaleString()}</CardTitle>
              )}
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Todas las campañas</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Clics (históricos)</CardDescription>
              {loadingCampaigns ? (
                <Skeleton className="h-9 w-24" />
              ) : (
                <CardTitle className="text-3xl">{totalClicks.toLocaleString()}</CardTitle>
              )}
            </CardHeader>
            <CardContent>
              {loadingCampaigns ? (
                <Skeleton className="h-4 w-20" />
              ) : (
                <p className="text-xs text-muted-foreground">
                  CTR {totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(2) : "0"}%
                </p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Saldo pendiente</CardDescription>
              {loadingInvoices ? (
                <Skeleton className="h-9 w-24" />
              ) : (
                <CardTitle className="text-3xl">{formatCents(outstandingCents)}</CardTitle>
              )}
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">En facturas abiertas</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="w-4 h-4" /> Campañas recientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingCampaigns ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (!campaigns || campaigns.length === 0) ? (
                <p className="text-sm text-muted-foreground">
                  Aún no tenés campañas.{" "}
                  <Link href="/brand/campaigns/new" className="text-primary hover:underline">
                    Creá la primera
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
                          <div className="font-medium text-sm">{c.name ?? c.title ?? `Campaña #${c.id}`}</div>
                          <div className="text-xs text-muted-foreground">
                            {campaignStatusLabel(c.status)} · {(c.impressions ?? 0).toLocaleString()} impresiones · {(c.clicks ?? 0).toLocaleString()} clics
                          </div>
                        </div>
                        <TrendingUp className="w-4 h-4 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Button asChild variant="link" size="sm" className="px-0 mt-2">
                <Link href="/brand/campaigns">Ver todas las campañas →</Link>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="w-4 h-4" /> Facturas recientes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingInvoices ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : (!invoices || invoices.length === 0) ? (
                <p className="text-sm text-muted-foreground">Aún no hay facturas.</p>
              ) : (
                <ul className="space-y-2">
                  {invoices.slice(0, 5).map(inv => (
                    <li key={inv.id}>
                      <Link
                        href="/brand/billing"
                        className="flex items-center justify-between rounded-md p-2 hover:bg-muted"
                      >
                        <div>
                          <div className="font-medium text-sm">{formatPeriodMonth(inv.periodMonth)}</div>
                          <div className="text-xs text-muted-foreground">{invoiceStatusLabel(inv.status)}</div>
                        </div>
                        <div className="text-sm font-medium">{inv.totalFormatted}</div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              <Button asChild variant="link" size="sm" className="px-0 mt-2">
                <Link href="/brand/billing">Ver todas las facturas →</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </BrandLayout>
  );
}
