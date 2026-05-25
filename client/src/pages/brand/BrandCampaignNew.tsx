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
      toast.success("Campaign created");
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
            <ArrowLeft className="w-3.5 h-3.5" /> Back to campaigns
          </Link>
          <h1 className="text-2xl font-bold mt-2">New campaign</h1>
          <p className="text-sm text-muted-foreground">
            Save as draft and add a creative image on the next screen.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Basics</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Internal name</Label>
                <Input
                  id="name"
                  required
                  minLength={2}
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Q2 launch — Café Britt"
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
                  <Label htmlFor="status">Initial status</Label>
                  <Select value={status} onValueChange={v => setStatus(v as CampaignStatus)}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
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
                  placeholder="Save 20% on premium coffee"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="description">Creative description</Label>
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
                  placeholder="https://example.com/landing"
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
                  <Label htmlFor="daily">Daily budget (USD, 0 = uncapped)</Label>
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
                <Label htmlFor="keywords">Target keywords (comma-separated)</Label>
                <Input
                  id="keywords"
                  value={keywords}
                  onChange={e => setKeywords(e.target.value)}
                  placeholder="coffee, café, espresso"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Link href="/brand/campaigns">
                  <Button type="button" variant="outline">
                    Cancel
                  </Button>
                </Link>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? "Creating…" : "Create campaign"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </BrandLayout>
  );
}
