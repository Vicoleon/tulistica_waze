import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useParams, useLocation } from "wouter";
import { BrandLayout } from "@/components/BrandLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from "recharts";
import { ArrowLeft, ImagePlus, Trash2, Loader2 } from "lucide-react";

type CampaignType = "sponsored_search" | "banner" | "cart_suggestion";
type CampaignStatus = "draft" | "active" | "paused" | "ended";

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Invalid file content"));
        return;
      }
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

function formatCents(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export default function BrandCampaignDetail() {
  const params = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const campaignId = Number(params.id);
  const utils = trpc.useUtils();

  const { data: campaign, isLoading } = trpc.brandCampaigns.get.useQuery(
    { id: campaignId },
    { enabled: Number.isFinite(campaignId) }
  );

  const [rangeDays, setRangeDays] = useState<number>(30);
  const { data: metrics, isLoading: loadingMetrics } = trpc.brandCampaigns.metricsTimeseries.useQuery(
    { campaignId, rangeDays },
    { enabled: Number.isFinite(campaignId) }
  );

  const updateMutation = trpc.brandCampaigns.update.useMutation({
    onSuccess: async () => {
      await utils.brandCampaigns.get.invalidate({ id: campaignId });
      await utils.brandCampaigns.list.invalidate();
      toast.success("Campaign saved");
    },
    onError: err => toast.error(err.message),
  });

  const setStatus = trpc.brandCampaigns.setStatus.useMutation({
    onSuccess: () => utils.brandCampaigns.get.invalidate({ id: campaignId }),
  });

  const deleteMutation = trpc.brandCampaigns.delete.useMutation({
    onSuccess: async () => {
      await utils.brandCampaigns.list.invalidate();
      toast.success("Campaign deleted");
      navigate("/brand/campaigns");
    },
  });

  const uploadMutation = trpc.brandCampaigns.uploadCreative.useMutation({
    onSuccess: async () => {
      await utils.brandCampaigns.get.invalidate({ id: campaignId });
      toast.success("Creative uploaded");
    },
    onError: err => toast.error(err.message),
  });

  // Local form state (controlled inputs)
  const [name, setName] = useState("");
  const [type, setType] = useState<CampaignType>("sponsored_search");
  const [status, setStatusLocal] = useState<CampaignStatus>("draft");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [bidCpc, setBidCpc] = useState("0");
  const [dailyBudget, setDailyBudget] = useState("0");
  const [keywords, setKeywords] = useState("");
  const [categories, setCategories] = useState("");
  const [cities, setCities] = useState("");

  useEffect(() => {
    if (!campaign) return;
    setName(campaign.name ?? "");
    setType((campaign.type as CampaignType) ?? "sponsored_search");
    setStatusLocal((campaign.status as CampaignStatus) ?? "draft");
    setTitle(campaign.title ?? "");
    setDescription(campaign.description ?? "");
    setTargetUrl(campaign.targetUrl ?? "");
    setBidCpc(String(campaign.bidCpc ?? 0));
    setDailyBudget(String((campaign.dailyBudgetCents ?? 0) / 100));
    setKeywords((campaign.targetKeywords ?? []).join(", "));
    setCategories((campaign.targetCategories ?? []).join(", "));
    setCities((campaign.targetCities ?? []).join(", "));
  }, [campaign]);

  const onSave = (e: FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      id: campaignId,
      name,
      type,
      status,
      title: title || undefined,
      description: description || undefined,
      targetUrl: targetUrl || undefined,
      bidCpc: Number(bidCpc) || 0,
      dailyBudgetCents: Math.round((Number(dailyBudget) || 0) * 100),
      targetKeywords: keywords ? keywords.split(",").map(k => k.trim()).filter(Boolean) : [],
      targetCategories: categories ? categories.split(",").map(k => k.trim()).filter(Boolean) : [],
      targetCities: cities ? cities.split(",").map(k => k.trim()).filter(Boolean) : [],
    });
  };

  const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be 5 MB or smaller");
      return;
    }
    try {
      const base64Data = await readFileAsBase64(file);
      await uploadMutation.mutateAsync({
        campaignId,
        filename: file.name,
        contentType: file.type,
        base64Data,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      e.target.value = "";
    }
  };

  const totals = metrics?.totals ?? { impressions: 0, clicks: 0, spendCents: 0, ctr: 0 };
  const series = useMemo(() => metrics?.series ?? [], [metrics]);

  if (!Number.isFinite(campaignId)) {
    return (
      <BrandLayout requireVerified>
        <p className="text-sm">Invalid campaign id.</p>
      </BrandLayout>
    );
  }

  return (
    <BrandLayout requireVerified>
      <div className="max-w-6xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link
              href="/brand/campaigns"
              className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to campaigns
            </Link>
            <h1 className="text-2xl font-bold mt-2">
              {campaign?.name ?? `Campaign #${campaignId}`}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge>{campaign?.status ?? "—"}</Badge>
              <span className="text-xs text-muted-foreground">{campaign?.type}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(campaign?.status === "active" || campaign?.status === "paused") && (
              <Button
                variant="outline"
                onClick={() =>
                  setStatus.mutate({
                    id: campaignId,
                    status: campaign.status === "paused" ? "active" : "paused",
                  })
                }
                disabled={setStatus.isPending}
              >
                {campaign.status === "paused" ? "Resume" : "Pause"}
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this campaign?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently remove the campaign and stop serving it.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate({ id: campaignId })}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <Tabs defaultValue="performance">
          <TabsList>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="creative">Creative</TabsTrigger>
            <TabsTrigger value="edit">Edit</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Impressions</CardDescription>
                  <CardTitle className="text-2xl">{totals.impressions.toLocaleString()}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Clicks</CardDescription>
                  <CardTitle className="text-2xl">{totals.clicks.toLocaleString()}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>CTR</CardDescription>
                  <CardTitle className="text-2xl">{totals.ctr}%</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Spend</CardDescription>
                  <CardTitle className="text-2xl">{formatCents(totals.spendCents)}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Daily performance</CardTitle>
                  <CardDescription>
                    Impressions, clicks and spend over time
                  </CardDescription>
                </div>
                <Select value={String(rangeDays)} onValueChange={v => setRangeDays(Number(v))}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="14">Last 14 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent>
                {loadingMetrics ? (
                  <div className="h-64 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 12 }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Legend />
                        <Line
                          yAxisId="left"
                          type="monotone"
                          dataKey="impressions"
                          stroke="#0d9488"
                          strokeWidth={2}
                          dot={false}
                          name="Impressions"
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="clicks"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={false}
                          name="Clicks"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Daily spend</CardTitle>
                <CardDescription>USD per day</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={series.map(r => ({ day: r.day, spend: r.spendCents / 100 }))}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip formatter={(v: number) => `$${v.toFixed(2)}`} />
                      <Bar dataKey="spend" fill="#0d9488" name="Spend (USD)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="creative" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Creative image</CardTitle>
                <CardDescription>PNG, JPG, WEBP up to 5 MB.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {campaign?.imageUrl ? (
                  <img
                    src={campaign.imageUrl}
                    alt="Campaign creative"
                    className="max-w-md w-full rounded-md border"
                  />
                ) : (
                  <div className="border border-dashed rounded-md p-10 text-center text-sm text-muted-foreground">
                    No creative uploaded yet.
                  </div>
                )}
                <div>
                  <Label htmlFor="creative-upload" className="inline-flex items-center gap-2 cursor-pointer rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted">
                    {uploadMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Uploading…
                      </>
                    ) : (
                      <>
                        <ImagePlus className="w-4 h-4" /> Upload new creative
                      </>
                    )}
                  </Label>
                  <input
                    id="creative-upload"
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    className="sr-only"
                    onChange={onFileChange}
                    disabled={uploadMutation.isPending}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="edit">
            <Card>
              <CardHeader>
                <CardTitle>Edit campaign</CardTitle>
                <CardDescription>
                  Change targeting, schedule, budget, status, and copy.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : (
                  <form onSubmit={onSave} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="name">Internal name</Label>
                      <Input
                        id="name"
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="type">Type</Label>
                        <Select value={type} onValueChange={v => setType(v as CampaignType)}>
                          <SelectTrigger id="type">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sponsored_search">Sponsored search</SelectItem>
                            <SelectItem value="banner">Banner</SelectItem>
                            <SelectItem value="cart_suggestion">Cart suggestion</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="status">Status</Label>
                        <Select value={status} onValueChange={v => setStatusLocal(v as CampaignStatus)}>
                          <SelectTrigger id="status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="draft">Draft</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="paused">Paused</SelectItem>
                            <SelectItem value="ended">Ended</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="title">Creative title</Label>
                      <Input
                        id="title"
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        rows={3}
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="targetUrl">Target URL</Label>
                      <Input
                        id="targetUrl"
                        type="url"
                        value={targetUrl}
                        onChange={e => setTargetUrl(e.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="bid">Bid CPC (USD)</Label>
                        <Input
                          id="bid"
                          type="number"
                          min="0"
                          step="0.01"
                          value={bidCpc}
                          onChange={e => setBidCpc(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="daily">Daily budget (USD)</Label>
                        <Input
                          id="daily"
                          type="number"
                          min="0"
                          step="1"
                          value={dailyBudget}
                          onChange={e => setDailyBudget(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="keywords">Keywords (comma separated)</Label>
                      <Input
                        id="keywords"
                        value={keywords}
                        onChange={e => setKeywords(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="categories">Categories (comma separated)</Label>
                      <Input
                        id="categories"
                        value={categories}
                        onChange={e => setCategories(e.target.value)}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="cities">Target cities (comma separated)</Label>
                      <Input
                        id="cities"
                        value={cities}
                        onChange={e => setCities(e.target.value)}
                      />
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button type="submit" disabled={updateMutation.isPending}>
                        {updateMutation.isPending ? "Saving…" : "Save changes"}
                      </Button>
                    </div>
                  </form>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </BrandLayout>
  );
}
