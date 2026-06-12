import { useState, type FormEvent } from "react";
import { useLocation, Link } from "wouter";
import { BrandLayout } from "@/components/BrandLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { CAMPAIGN_STATUS_LABELS, CAMPAIGN_TYPE_LABELS } from "./labels";

type CampaignType = "sponsored_search" | "banner" | "cart_suggestion";
type CampaignStatus = "draft" | "active" | "paused" | "ended";

export default function BrandCampaignNew() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [type, setType] = useState<CampaignType>("sponsored_search");
  const [status, setStatus] = useState<CampaignStatus>("draft");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [bidCpc, setBidCpc] = useState("0.10");
  const [dailyBudget, setDailyBudget] = useState("10");
  const [keywords, setKeywords] = useState("");

  const createMutation = trpc.brandCampaigns.create.useMutation({
    onSuccess: async created => {
      await utils.brandCampaigns.list.invalidate();
      toast.success("Campaña creada");
      if (created?.id) navigate(`/brand/campaigns/${created.id}`);
    },
    onError: err => toast.error(err.message),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      name,
      type,
      status,
      title: title || undefined,
      description: description || undefined,
      targetUrl: targetUrl || undefined,
      bidCpc: Number(bidCpc) || 0,
      dailyBudgetCents: Math.round((Number(dailyBudget) || 0) * 100),
      targetKeywords: keywords
        ? keywords.split(",").map(k => k.trim()).filter(Boolean)
        : undefined,
    });
  };

  return (
    <BrandLayout requireVerified>
      <div className="max-w-2xl space-y-6">
        <div>
          <Link href="/brand/campaigns" className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Volver a campañas
          </Link>
          <h1 className="text-2xl font-bold mt-2">Nueva campaña</h1>
          <p className="text-sm text-muted-foreground">
            Guardala como borrador y agregá la imagen creativa en la siguiente pantalla.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Datos básicos</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Nombre interno</Label>
                <Input
                  id="name"
                  required
                  minLength={2}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Lanzamiento Q2 — Café Britt"
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
                  <Label htmlFor="status">Estado inicial</Label>
                  <Select value={status} onValueChange={v => setStatus(v as CampaignStatus)}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">{CAMPAIGN_STATUS_LABELS.draft}</SelectItem>
                      <SelectItem value="active">{CAMPAIGN_STATUS_LABELS.active}</SelectItem>
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
                  placeholder="Ahorrá 20% en café premium"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Descripción de la creatividad</Label>
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
                  placeholder="https://example.com/landing"
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
                  <Label htmlFor="daily">Presupuesto diario (USD, 0 = sin límite)</Label>
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
                  placeholder="café, espresso, café molido"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button asChild type="button" variant="outline">
                  <Link href="/brand/campaigns">Cancelar</Link>
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creando…" : "Crear campaña"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </BrandLayout>
  );
}
