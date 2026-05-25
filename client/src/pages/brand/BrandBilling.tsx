import { useMemo, useState } from "react";
import { BrandLayout } from "@/components/BrandLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Download, Receipt, RefreshCcw, CreditCard } from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-foreground",
  open: "bg-amber-100 text-amber-800",
  paid: "bg-green-100 text-green-800",
  uncollectible: "bg-red-100 text-red-800",
  void: "bg-gray-200 text-gray-700",
};

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastNPeriods(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = 0; i < n; i++) {
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
    d.setUTCMonth(d.getUTCMonth() - 1);
  }
  return out;
}

export default function BrandBilling() {
  const utils = trpc.useUtils();
  const { data: invoices, isLoading } = trpc.brandBilling.listInvoices.useQuery();
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentPeriod());
  const periods = useMemo(() => lastNPeriods(12), []);

  const exportQuery = trpc.brandBilling.exportMonthlyCsv.useQuery(
    { periodMonth: selectedPeriod },
    { enabled: false }
  );

  const generateMutation = trpc.brandBilling.generateForPeriod.useMutation({
    onSuccess: () => utils.brandBilling.listInvoices.invalidate(),
  });

  const payMutation = trpc.brandBilling.createPaymentIntent.useMutation({
    onSuccess: result => {
      if ("autoPaid" in result && result.autoPaid) {
        toast.success("Invoice marked as paid (dev stub)");
        utils.brandBilling.listInvoices.invalidate();
      } else if ("clientSecret" in result) {
        toast.success(`Payment intent created (${result.providerId})`);
      }
    },
    onError: err => toast.error(err.message),
  });

  const downloadCsv = async () => {
    try {
      const data = await exportQuery.refetch();
      if (!data.data) throw new Error("No data returned");
      const blob = new Blob([data.data.csv], { type: data.data.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    }
  };

  return (
    <BrandLayout requireVerified>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold">Billing</h1>
          <p className="text-sm text-muted-foreground">
            Invoices, CSV exports, and payment.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Monthly CSV export
            </CardTitle>
            <CardDescription>
              Detailed spend per campaign for the selected period.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Period</label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map(p => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={() => generateMutation.mutate({ periodMonth: selectedPeriod })}
                disabled={generateMutation.isPending}
                variant="outline"
              >
                <RefreshCcw className="w-4 h-4 mr-2" />
                {generateMutation.isPending ? "Generating…" : "Regenerate invoice"}
              </Button>
              <Button onClick={downloadCsv} disabled={exportQuery.isFetching}>
                <Download className="w-4 h-4 mr-2" />
                {exportQuery.isFetching ? "Preparing…" : "Download CSV"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invoices</CardTitle>
            <CardDescription>Issued monthly. Pay or export anytime.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
            {!isLoading && (!invoices || invoices.length === 0) && (
              <div className="p-12 text-center space-y-2">
                <Receipt className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No invoices yet.</p>
                <Button
                  variant="outline"
                  onClick={() => generateMutation.mutate({ periodMonth: currentPeriod() })}
                  disabled={generateMutation.isPending}
                >
                  Generate current period
                </Button>
              </div>
            )}
            {invoices && invoices.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Issued</th>
                      <th className="px-4 py-3">Due</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.id} className="border-t">
                        <td className="px-4 py-3 font-medium">{inv.periodMonth}</td>
                        <td className="px-4 py-3">
                          <Badge className={STATUS_BADGE[inv.status] ?? ""}>{inv.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{inv.totalFormatted}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setSelectedPeriod(inv.periodMonth);
                                downloadCsv();
                              }}
                            >
                              <Download className="w-3.5 h-3.5 mr-1" /> CSV
                            </Button>
                            {inv.status === "open" && (
                              <Button
                                size="sm"
                                onClick={() => payMutation.mutate({ invoiceId: inv.id })}
                                disabled={payMutation.isPending}
                              >
                                <CreditCard className="w-3.5 h-3.5 mr-1" /> Pay
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </BrandLayout>
  );
}
