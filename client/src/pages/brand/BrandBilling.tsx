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
import { Download, Receipt, RefreshCcw, CreditCard, Loader2 } from "lucide-react";
import {
  INVOICE_STATUS_BADGE,
  invoiceStatusLabel,
  formatPeriodMonth,
} from "./labels";

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
  const [exportingPeriod, setExportingPeriod] = useState<string | null>(null);
  const periods = useMemo(() => lastNPeriods(12), []);

  const generateMutation = trpc.brandBilling.generateForPeriod.useMutation({
    onSuccess: () => {
      toast.success("Factura generada");
      utils.brandBilling.listInvoices.invalidate();
    },
    onError: err => toast.error(err.message || "No se pudo generar la factura"),
  });

  const payMutation = trpc.brandBilling.createPaymentIntent.useMutation({
    onSuccess: result => {
      if ("autoPaid" in result && result.autoPaid) {
        toast.success("Factura marcada como pagada (modo de prueba)");
        utils.brandBilling.listInvoices.invalidate();
      } else if ("clientSecret" in result) {
        toast.success(`Intento de pago creado (${result.providerId})`);
      }
    },
    onError: err => toast.error(err.message),
  });

  const downloadCsv = async (periodMonth: string) => {
    setExportingPeriod(periodMonth);
    try {
      const data = await utils.brandBilling.exportMonthlyCsv.fetch({ periodMonth });
      if (!data) throw new Error("No se recibieron datos");
      const blob = new Blob([data.csv], { type: data.contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo exportar");
    } finally {
      setExportingPeriod(null);
    }
  };

  const payingInvoiceId = payMutation.isPending ? payMutation.variables?.invoiceId : undefined;

  return (
    <BrandLayout requireVerified>
      <div className="space-y-6 max-w-5xl">
        <div>
          <h1 className="text-2xl font-bold">Facturación</h1>
          <p className="text-sm text-muted-foreground">
            Facturas, exportaciones CSV y pagos.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-4 h-4" /> Exportación CSV mensual
            </CardTitle>
            <CardDescription>
              Gasto detallado por campaña para el período seleccionado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
              <div className="flex-1 space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Período</label>
                <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {periods.map(p => (
                      <SelectItem key={p} value={p}>
                        {formatPeriodMonth(p)}
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
                {generateMutation.isPending ? "Generando…" : "Regenerar factura"}
              </Button>
              <Button
                onClick={() => downloadCsv(selectedPeriod)}
                disabled={exportingPeriod !== null}
              >
                <Download className="w-4 h-4 mr-2" />
                {exportingPeriod === selectedPeriod ? "Preparando…" : "Descargar CSV"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Facturas</CardTitle>
            <CardDescription>Se emiten mensualmente. Pagá o exportá cuando quieras.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && <p className="p-6 text-sm text-muted-foreground">Cargando…</p>}
            {!isLoading && (!invoices || invoices.length === 0) && (
              <div className="p-12 text-center space-y-2">
                <Receipt className="w-10 h-10 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Aún no hay facturas.</p>
                <Button
                  variant="outline"
                  onClick={() => generateMutation.mutate({ periodMonth: currentPeriod() })}
                  disabled={generateMutation.isPending}
                >
                  Generar período actual
                </Button>
              </div>
            )}
            {invoices && invoices.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Período</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Emitida</th>
                      <th className="px-4 py-3">Vence</th>
                      <th className="px-4 py-3 text-right">Total</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map(inv => (
                      <tr key={inv.id} className="border-t">
                        <td className="px-4 py-3 font-medium">{formatPeriodMonth(inv.periodMonth)}</td>
                        <td className="px-4 py-3">
                          <Badge className={INVOICE_STATUS_BADGE[inv.status] ?? ""}>
                            {invoiceStatusLabel(inv.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {inv.issuedAt ? new Date(inv.issuedAt).toLocaleDateString("es-CR") : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {inv.dueAt ? new Date(inv.dueAt).toLocaleDateString("es-CR") : "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{inv.totalFormatted}</td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center gap-2 justify-end">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => downloadCsv(inv.periodMonth)}
                              disabled={exportingPeriod === inv.periodMonth}
                            >
                              {exportingPeriod === inv.periodMonth ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              ) : (
                                <Download className="w-3.5 h-3.5 mr-1" />
                              )}
                              CSV
                            </Button>
                            {inv.status === "open" && (
                              <Button
                                size="sm"
                                onClick={() => payMutation.mutate({ invoiceId: inv.id })}
                                disabled={payingInvoiceId === inv.id}
                              >
                                {payingInvoiceId === inv.id ? (
                                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                ) : (
                                  <CreditCard className="w-3.5 h-3.5 mr-1" />
                                )}
                                Pagar
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
