import { BrandLayout } from "@/components/BrandLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Plus, Megaphone, Pause, Play, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  CAMPAIGN_STATUS_BADGE,
  campaignStatusLabel,
  campaignTypeLabel,
} from "./labels";

export default function BrandCampaigns() {
  const { data: campaigns, isLoading } = trpc.brandCampaigns.list.useQuery();
  const utils = trpc.useUtils();
  const setStatus = trpc.brandCampaigns.setStatus.useMutation({
    onSuccess: () => utils.brandCampaigns.list.invalidate(),
  });
  const pendingId = setStatus.isPending ? setStatus.variables?.id : undefined;

  const togglePause = async (id: number, currentStatus: string) => {
    const next = currentStatus === "paused" ? "active" : "paused";
    try {
      await setStatus.mutateAsync({ id, status: next });
      toast.success(next === "paused" ? "Campaña pausada" : "Campaña reanudada");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo actualizar");
    }
  };

  return (
    <BrandLayout requireVerified>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Campañas</h1>
            <p className="text-sm text-muted-foreground">
              Editá creatividades, presupuestos, segmentación y ritmo.
            </p>
          </div>
          <Button asChild>
            <Link href="/brand/campaigns/new">
              <Plus className="w-4 h-4 mr-2" /> Nueva campaña
            </Link>
          </Button>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Cargando campañas…</p>}

        {!isLoading && (!campaigns || campaigns.length === 0) && (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Megaphone className="w-10 h-10 mx-auto text-muted-foreground" />
              <h2 className="text-lg font-semibold">Aún no hay campañas</h2>
              <p className="text-sm text-muted-foreground">
                Creá tu primera campaña para llegar a más compradores.
              </p>
              <Button asChild>
                <Link href="/brand/campaigns/new">
                  <Plus className="w-4 h-4 mr-2" /> Nueva campaña
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {campaigns && campaigns.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Campaña</th>
                      <th className="px-4 py-3">Estado</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3 text-right">Impresiones</th>
                      <th className="px-4 py-3 text-right">Clics</th>
                      <th className="px-4 py-3 text-right">CTR</th>
                      <th className="px-4 py-3 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => {
                      const rowPending = pendingId === c.id;
                      return (
                        <tr key={c.id} className="border-t hover:bg-muted/30">
                          <td className="px-4 py-3">
                            <Link
                              href={`/brand/campaigns/${c.id}`}
                              className="font-medium hover:underline"
                            >
                              {c.name ?? c.title ?? `Campaña #${c.id}`}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className={CAMPAIGN_STATUS_BADGE[c.status] ?? ""}>
                              {campaignStatusLabel(c.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {campaignTypeLabel(c.type)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {(c.impressions ?? 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {(c.clicks ?? 0).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">{c.ctr}%</td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              {(c.status === "active" || c.status === "paused") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => togglePause(c.id, c.status)}
                                  disabled={rowPending}
                                >
                                  {rowPending ? (
                                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                  ) : c.status === "paused" ? (
                                    <Play className="w-3.5 h-3.5 mr-1" />
                                  ) : (
                                    <Pause className="w-3.5 h-3.5 mr-1" />
                                  )}
                                  {c.status === "paused" ? "Reanudar" : "Pausar"}
                                </Button>
                              )}
                              <Button asChild variant="outline" size="sm">
                                <Link href={`/brand/campaigns/${c.id}`}>Abrir</Link>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </BrandLayout>
  );
}
