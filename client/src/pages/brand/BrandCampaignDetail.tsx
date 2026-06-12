import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Link, useParams, useLocation } from "wouter";
import { BrandLayout } from "@/components/BrandLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  CAMPAIGN_STATUS_LABELS,
  CAMPAIGN_TYPE_LABELS,
  campaignStatusLabel,
  campaignTypeLabel,
} from "./labels";

type CampaignType = "sponsored_search" | "banner" | "cart_suggestion";
type CampaignStatus = "draft" | "active" | "paused" | "ended";

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Contenido de archivo inválido"));
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
      toast.success("Campaña guardada");
    },
    onError: err => toast.error(err.message),
  });

  const setStatus = trpc.brandCampaigns.setStatus.useMutation({
    onSuccess: () => utils.brandCampaigns.get.invalidate({ id: campaignId }),
    onError: err => toast.error(err.message || "No se pudo cambiar el estado"),
  });

  const deleteMutation = trpc.brandCampaigns.delete.useMutation({
    onSuccess: async () => {
      await utils.brandCampaigns.list.invalidate();
      toast.success("Campaña eliminada");
      navigate("/brand/campaigns");
    },
    onError: err => toast.error(err.message || "No se pudo eliminar la campaña"),
  });

  const uploadMutation = trpc.brandCampaigns.uploadCreative.useMutation({
    onSuccess: async () => {
      await utils.brandCampaigns.get.invalidate({ id: campaignId });
      toast.success("Creatividad subida");
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

  // Seed the form only when a different campaign loads — refetches of the
  // same campaign must not wipe in-progress edits.
  const lastSeededId = useRef<number | null>(null);
  useEffect(() => {
    if (!campaign) return;
    if (lastSeededId.current === campaign.id) return;
    lastSeededId.current = campaign.id;
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
      toast.error("La imagen debe pesar 5 MB o menos");
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
      toast.error(err instanceof Error ? err.message : "No se pudo subir la imagen");
    } finally {
      e.target.value = "";
    }
  };

  const totals = metrics?.totals ?? { impressions: 0, clicks: 0, spendCents: 0, ctr: 0 };
  const series = useMemo(() => metrics?.series ?? [], [metrics]);

  if (!Number.isFinite(campaignId)) {
    return (
      <BrandLayout requireVerified>
        <p className="text-sm">ID de campaña inválido.</p>
      </BrandLayout>
    );
  }

  if (isLoading) {
    return (
      <BrandLayout requireVerified>
        <div className="max-w-6xl space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-5 w-32" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map(i => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-72" />
        </div>
      </BrandLayout>
    );
  }

  if (!campaign) {
    return (
      <BrandLayout requireVerified>
        <div className="max-w-6xl py-16 text-center space-y-3">
          <h1 className="text-xl font-semibold">Campaña no encontrada</h1>
          <p className="text-sm text-muted-foreground">
            La campaña no existe o ya fue eliminada.
          </p>
          <Link
            href="/brand/campaigns"
            className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Volver a campañas
          </Link>
        </div>
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
              <ArrowLeft className="w-3.5 h-3.5" /> Volver a campañas
            </Link>
            <h1 className="text-2xl font-bold mt-2">
              {campaign.name ?? `Campaña #${campaignId}`}
            </h1>
            <div className="flex items-center gap-2 mt-1">
              <Badge>{campaignStatusLabel(campaign.status)}</Badge>
              <span className="text-xs text-muted-foreground">
                {campaign.type ? campaignTypeLabel(campaign.type) : null}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {(campaign.status === "active" || campaign.status === "paused") && (
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
                {campaign.status === "paused" ? "Reanudar" : "Pausar"}
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="w-4 h-4 mr-2" /> Eliminar
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>¿Eliminar esta campaña?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Se eliminará la campaña de forma permanente y dejará de mostrarse.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => deleteMutation.mutate({ id: campaignId })}
                  >
                    Eliminar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <Tabs defaultValue="performance">
          <TabsList>
            <TabsTrigger value="performance">Rendimiento</TabsTrigger>
            <TabsTrigger value="creative">Creatividad</TabsTrigger>
            <TabsTrigger value="edit">Editar</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Impresiones</CardDescription>
                  <CardTitle className="text-2xl">{totals.impressions.toLocaleString()}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Clics</CardDescription>
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
                  <CardDescription>Gasto</CardDescription>
                  <CardTitle className="text-2xl">{formatCents(totals.spendCents)}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Rendimiento diario</CardTitle>
                  <CardDescription>
                    Impresiones, clics y gasto en el tiempo
                  </CardDescription>
                </div>
                <Select value={String(rangeDays)} onValueChange={v => setRangeDays(Number(v))}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">Últimos 7 días</SelectItem>
                    <SelectItem value="14">Últimos 14 días</SelectItem>
                    <SelectItem value="30">Últimos 30 días</SelectItem>
                    <SelectItem value="90">Últimos 90 días</SelectItem>
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
                          name="Impresiones"
                        />
                        <Line
                          yAxisId="right"
                          type="monotone"
                          dataKey="clicks"
                          stroke="#f59e0b"
                          strokeWidth={2}
                          dot={false}
                          name="Clics"
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gasto diario</CardTitle>
                <CardDescription>USD por día</CardDescription>
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
                      <Bar dataKey="spend" fill="#0d9488" name="Gasto (USD)" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="creative" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Imagen creativa</CardTitle>
                <CardDescription>PNG, JPG o WEBP de hasta 5 MB.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {campaign.imageUrl ? (
                  <img
                    src={campaign.imageUrl}
                    alt="Creatividad de la campaña"
                    className="max-w-md w-full rounded-md border"
                  />
                ) : (
                  <div className="border border-dashed rounded-md p-10 text-center text-sm text-muted-foreground">
                    Aún no subiste una creatividad.
                  </div>
                )}
                <div>
                  <Label htmlFor="creative-upload" className="inline-flex items-center gap-2 cursor-pointer rounded-md border bg-card px-3 py-2 text-sm hover:bg-muted">
                    {uploadMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Subiendo…
                      </>
                    ) : (
                      <>
                        <ImagePlus className="w-4 h-4" /> Subir nueva creatividad
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
                <CardTitle>Editar campaña</CardTitle>
                <CardDescription>
                  Modificá segmentación, presupuesto, estado y textos.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={onSave} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Nombre interno</Label>
                    <Input
                      id="name"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="type">Tipo</Label>
                      <Select value={type} onValueChange={v => setType(v as CampaignType)}>
                        <SelectTrigger id="type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sponsored_search">
                            {CAMPAIGN_TYPE_LABELS.sponsored_search}
                          </SelectItem>
                          <SelectItem value="banner">{CAMPAIGN_TYPE_LABELS.banner}</SelectItem>
                          <SelectItem value="cart_suggestion">
                            {CAMPAIGN_TYPE_LABELS.cart_suggestion}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="status">Estado</Label>
                      <Select value={status} onValueChange={v => setStatusLocal(v as CampaignStatus)}>
                        <SelectTrigger id="status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">{CAMPAIGN_STATUS_LABELS.draft}</SelectItem>
                          <SelectItem value="active">{CAMPAIGN_STATUS_LABELS.active}</SelectItem>
                          <SelectItem value="paused">{CAMPAIGN_STATUS_LABELS.paused}</SelectItem>
                          <SelectItem value="ended">{CAMPAIGN_STATUS_LABELS.ended}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="title">Título de la creatividad</Label>
                    <Input
                      id="title"
                      value={title}
                      onChange={e => setTitle(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="description">Descripción</Label>
                    <Textarea
                      id="description"
                      rows={3}
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="targetUrl">URL de destino</Label>
                    <Input
                      id="targetUrl"
                      type="url"
                      value={targetUrl}
                      onChange={e => setTargetUrl(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="bid">Puja CPC (USD)</Label>
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
                      <Label htmlFor="daily">Presupuesto diario (USD)</Label>
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
                    <Label htmlFor="keywords">Palabras clave (separadas por comas)</Label>
                    <Input
                      id="keywords"
                      value={keywords}
                      onChange={e => setKeywords(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="categories">Categorías (separadas por comas)</Label>
                    <Input
                      id="categories"
                      value={categories}
                      onChange={e => setCategories(e.target.value)}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cities">Ciudades objetivo (separadas por comas)</Label>
                    <Input
                      id="cities"
                      value={cities}
                      onChange={e => setCities(e.target.value)}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="submit" disabled={updateMutation.isPending}>
                      {updateMutation.isPending ? "Guardando…" : "Guardar cambios"}
                    </Button>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </BrandLayout>
  );
}
