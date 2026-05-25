import { BrandLayout } from "@/components/BrandLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import { Plus, Megaphone, Pause, Play } from "lucide-react";
import { toast } from "sonner";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-muted text-foreground",
  active: "bg-green-100 text-green-800",
  paused: "bg-amber-100 text-amber-800",
  ended: "bg-gray-200 text-gray-700",
};

export default function BrandCampaigns() {
  const { data: campaigns, isLoading } = trpc.brandCampaigns.list.useQuery();
  const utils = trpc.useUtils();
  const setStatus = trpc.brandCampaigns.setStatus.useMutation({
    onSuccess: () => utils.brandCampaigns.list.invalidate(),
  });

  const togglePause = async (id: number, currentStatus: string) => {
    const next = currentStatus === "paused" ? "active" : "paused";
    try {
      await setStatus.mutateAsync({ id, status: next });
      toast.success(next === "paused" ? "Campaign paused" : "Campaign resumed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    }
  };

  return (
    <BrandLayout requireVerified>
      <div className="space-y-6 max-w-6xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold">Campaigns</h1>
            <p className="text-sm text-muted-foreground">
              Edit creatives, budgets, targeting, and pace.
            </p>
          </div>
          <Link href="/brand/campaigns/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" /> New campaign
            </Button>
          </Link>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading campaigns…</p>}

        {!isLoading && (!campaigns || campaigns.length === 0) && (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <Megaphone className="w-10 h-10 mx-auto text-muted-foreground" />
              <h2 className="text-lg font-semibold">No campaigns yet</h2>
              <p className="text-sm text-muted-foreground">
                Create your first campaign to start reaching shoppers.
              </p>
              <Link href="/brand/campaigns/new">
                <Button>
                  <Plus className="w-4 h-4 mr-2" /> New campaign
                </Button>
              </Link>
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
                      <th className="px-4 py-3">Campaign</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3 text-right">Impressions</th>
                      <th className="px-4 py-3 text-right">Clicks</th>
                      <th className="px-4 py-3 text-right">CTR</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.map(c => (
                      <tr key={c.id} className="border-t hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Link
                            href={`/brand/campaigns/${c.id}`}
                            className="font-medium hover:underline"
                          >
                            {c.name ?? c.title ?? `Campaign #${c.id}`}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={STATUS_BADGE[c.status] ?? ""}>{c.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{c.type}</td>
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
                                disabled={setStatus.isPending}
                              >
                                {c.status === "paused" ? (
                                  <>
                                    <Play className="w-3.5 h-3.5 mr-1" /> Resume
                                  </>
                                ) : (
                                  <>
                                    <Pause className="w-3.5 h-3.5 mr-1" /> Pause
                                  </>
                                )}
                              </Button>
                            )}
                            <Link href={`/brand/campaigns/${c.id}`}>
                              <Button variant="outline" size="sm">
                                Open
                              </Button>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
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
