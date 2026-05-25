import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Cpu, Sparkles, Trash2, CheckCircle2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type Provider = "openai" | "gemini" | "deepseek";

interface ProviderInfo {
  label: string;
  /** Models ordered cheap → expensive so the default selection biases low cost. */
  models: string[];
  /** Rough per-1M-tokens output cost (USD) for the cheapest model. Informational. */
  cheapestNote: string;
}

const PROVIDERS: Record<Provider, ProviderInfo> = {
  openai: {
    label: "OpenAI",
    models: ["gpt-4o-mini", "gpt-4.1-nano", "gpt-4.1-mini", "gpt-4o", "gpt-4.1"],
    cheapestNote: "gpt-4o-mini ≈ $0.60 / 1M output",
  },
  gemini: {
    // Ordered cheap → expensive (output price per 1M tokens, May 2026).
    // - gemini-3.1-flash-lite: $0.25 in / $1.50 out — GA, cheapest, fastest
    // - gemini-2.5-flash-lite:  $0.40 out — previous-gen budget option
    // - gemini-2.5-flash:        general-purpose, still GA
    // - gemini-3.5-flash:        $1.50 in / $9.00 out — Pro-level intelligence at Flash tier
    // - gemini-2.5-pro:          full Pro tier, previous gen
    // - gemini-3.1-pro-preview:  $2-4 in / $12-18 out — newest Pro, preview
    // NOTE: gemini-2.0-flash is deprecated and shuts down June 1, 2026 — removed.
    label: "Google Gemini",
    models: [
      "gemini-3.1-flash-lite",
      "gemini-2.5-flash-lite",
      "gemini-2.5-flash",
      "gemini-3.5-flash",
      "gemini-2.5-pro",
      "gemini-3.1-pro-preview",
    ],
    cheapestNote: "gemini-3.1-flash-lite ≈ $0.25 in / $1.50 out / 1M tokens",
  },
  deepseek: {
    label: "DeepSeek",
    models: ["deepseek-chat", "deepseek-reasoner"],
    cheapestNote: "deepseek-chat ≈ $0.28 / 1M output (cheapest)",
  },
};

const PROVIDER_ORDER: Provider[] = ["openai", "gemini", "deepseek"];

export default function AdminLlmConfig() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.admin.llmConfig.useQuery();
  const [drafts, setDrafts] = useState<Record<Provider, string>>({
    openai: "",
    gemini: "",
    deepseek: "",
  });

  const setKey = trpc.admin.setLlmKey.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(`API key de ${PROVIDERS[vars.provider as Provider].label} guardada`);
      setDrafts((prev) => ({ ...prev, [vars.provider]: "" }));
      utils.admin.llmConfig.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteKey = trpc.admin.deleteLlmKey.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(`API key de ${PROVIDERS[vars.provider as Provider].label} eliminada`);
      utils.admin.llmConfig.invalidate();
    },
  });

  const setActive = trpc.admin.setLlmActive.useMutation({
    onSuccess: (_d, vars) => {
      toast.success(
        `Modelo activo: ${PROVIDERS[vars.provider as Provider].label} · ${vars.model}`
      );
      utils.admin.llmConfig.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading || !data) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6 text-sm text-muted-foreground">
          Cargando configuración LLM...
        </CardContent>
      </Card>
    );
  }

  const activeProvider = data.activeProvider;
  const keysByProvider = new Map(data.keys.map((k) => [k.provider, k]));

  return (
    <Card className="mb-6 border-amber-300/50 bg-amber-50/30 dark:bg-amber-950/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-amber-600" />
          LLM (admin)
          <Badge variant="outline" className="text-xs">Sólo vos lo ves</Badge>
        </CardTitle>
        <CardDescription>
          Pegá las API keys que quieras usar y elegí el proveedor + modelo activo.
          Las keys se guardan encriptadas (AES-256-GCM) y todas las llamadas (recetas, foto IA)
          usan el modelo activo. Cambiá el modelo cuando quieras controlar costos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {PROVIDER_ORDER.map((provider) => {
          const info = PROVIDERS[provider];
          const status = keysByProvider.get(provider);
          const configured = status?.configured;
          const currentModel = status?.model ?? info.models[0];
          const isActive = activeProvider === provider;

          return (
            <div
              key={provider}
              className={`rounded-lg border p-4 space-y-3 ${isActive ? "border-primary bg-primary/5" : ""}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{info.label}</span>
                  {configured && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                      ...{status?.maskedTail}
                    </Badge>
                  )}
                  {isActive && (
                    <Badge className="bg-primary text-primary-foreground text-xs gap-1">
                      <Sparkles className="w-3 h-3" /> Activo
                    </Badge>
                  )}
                </div>
                {configured && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm(`¿Eliminar API key de ${info.label}?`)) {
                        deleteKey.mutate({ provider });
                      }
                    }}
                    aria-label={`Eliminar ${info.label}`}
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>

              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder={configured ? "Pegá una key nueva para reemplazar" : `API key de ${info.label}`}
                  value={drafts[provider]}
                  onChange={(e) =>
                    setDrafts((prev) => ({ ...prev, [provider]: e.target.value }))
                  }
                  autoComplete="off"
                  className="flex-1 font-mono text-xs"
                />
                <Button
                  size="sm"
                  disabled={drafts[provider].length < 8 || setKey.isPending}
                  onClick={() =>
                    setKey.mutate({ provider, apiKey: drafts[provider] })
                  }
                >
                  {setKey.isPending && setKey.variables?.provider === provider ? "Guardando..." : "Guardar"}
                </Button>
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-2 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">Modelo</Label>
                  <Select
                    value={currentModel}
                    onValueChange={(value) =>
                      setActive.mutate({ provider, model: value })
                    }
                    disabled={!configured || setActive.isPending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Elegí un modelo" />
                    </SelectTrigger>
                    <SelectContent>
                      {info.models.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  size="sm"
                  variant={isActive ? "secondary" : "outline"}
                  disabled={!configured || isActive || setActive.isPending}
                  onClick={() => setActive.mutate({ provider, model: currentModel })}
                >
                  {isActive ? "Activo" : "Activar"}
                </Button>
              </div>

              <p className="text-xs text-muted-foreground">{info.cheapestNote}</p>
            </div>
          );
        })}

        {!data.keys.some((k) => k.configured) && (
          <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Sin keys configuradas, las funciones de IA (recetas, foto producto) van a fallar
            con un error claro. Configurá al menos una para activarlas.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
