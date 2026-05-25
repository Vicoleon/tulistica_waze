import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft, User, MapPin, Clock, Save, LogOut, Shield, Award, TrendingUp,
  Key, Trash2, CheckCircle2, AlertTriangle,
} from "lucide-react";
import AdminLlmConfig from "@/components/AdminLlmConfig";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/currency";

const CR_PRESETS: Array<{ label: string; lat: number; lng: number }> = [
  { label: "San José Centro", lat: 9.9281, lng: -84.0907 },
  { label: "Escazú", lat: 9.9233, lng: -84.1397 },
  { label: "Heredia", lat: 10.0024, lng: -84.1165 },
  { label: "Alajuela", lat: 10.0162, lng: -84.2116 },
  { label: "Cartago", lat: 9.8644, lng: -83.9194 },
];

export default function Profile() {
  const { user, loading, isAuthenticated, logout } = useAuth({
    redirectOnUnauthenticated: true,
  });
  const [, setLocation] = useLocation();
  const [homeLatitude, setHomeLatitude] = useState("");
  const [homeLongitude, setHomeLongitude] = useState("");
  const [defaultRadius, setDefaultRadius] = useState([10]);
  const [fuelCost, setFuelCost] = useState("250");
  const [timeValue, setTimeValue] = useState("3000");

  const utils = trpc.useUtils();
  const updateLocation = trpc.user.updateLocation.useMutation({
    onSuccess: () => utils.auth.me.invalidate(),
  });
  const updatePreferences = trpc.user.updatePreferences.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      toast.success("Perfil actualizado");
    },
  });

  // Integration credentials (Auto Mercado, etc.)
  const { data: integrations } = trpc.integrations.list.useQuery(undefined, {
    enabled: true,
  });
  const [amEmail, setAmEmail] = useState("");
  const [amPassword, setAmPassword] = useState("");
  const saveIntegration = trpc.integrations.save.useMutation({
    onSuccess: () => {
      toast.success("Credenciales guardadas (encriptadas)");
      setAmEmail("");
      setAmPassword("");
      utils.integrations.list.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteIntegration = trpc.integrations.delete.useMutation({
    onSuccess: () => {
      toast.success("Credenciales eliminadas");
      utils.integrations.list.invalidate();
    },
  });
  const automercadoCred = integrations?.find((i) => i.integration === "automercado");

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (user) {
      setHomeLatitude(user.homeLatitude?.toString() ?? "");
      setHomeLongitude(user.homeLongitude?.toString() ?? "");
      setDefaultRadius([user.defaultRadiusKm ?? 10]);
      setFuelCost(user.fuelCostPerKm?.toString() ?? "250");
      setTimeValue(user.timeValuePerHour?.toString() ?? "3000");
    }
  }, [user]);

  const handleSave = () => {
    if (homeLatitude && homeLongitude) {
      updateLocation.mutate({
        latitude: parseFloat(homeLatitude),
        longitude: parseFloat(homeLongitude),
      });
    }
    updatePreferences.mutate({
      defaultRadiusKm: defaultRadius[0],
      fuelCostPerKm: parseFloat(fuelCost),
      timeValuePerHour: parseFloat(timeValue),
    });
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      toast.error("Tu navegador no soporta geolocalización");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setHomeLatitude(pos.coords.latitude.toFixed(6));
        setHomeLongitude(pos.coords.longitude.toFixed(6));
        toast.success("Ubicación detectada");
      },
      () => toast.error("No pudimos obtener tu ubicación")
    );
  };

  const handleLogout = async () => {
    await logout();
    setLocation("/");
  };

  if (loading || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" aria-label="Volver al tablero">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Perfil y configuración</h1>
        </div>
      </header>

      <main className="container py-6 max-w-2xl">
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="w-5 h-5" />
              Cuenta
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                <span className="text-2xl font-bold text-primary-foreground">
                  {user?.name?.[0]?.toUpperCase() ?? "?"}
                </span>
              </div>
              <div>
                <h3 className="text-xl font-semibold">{user?.name ?? "Usuario"}</h3>
                <p className="text-muted-foreground">{user?.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-primary">
                  <Shield className="w-4 h-4" />
                  <span className="text-2xl font-bold">{user?.trustScore ?? 10}</span>
                </div>
                <div className="text-sm text-muted-foreground">Confianza</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-primary">
                  <TrendingUp className="w-4 h-4" />
                  <span className="text-2xl font-bold">{user?.totalPoints ?? 0}</span>
                </div>
                <div className="text-sm text-muted-foreground">Puntos</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 text-primary">
                  <Award className="w-4 h-4" />
                  <span className="text-2xl font-bold">{user?.priceReportsCount ?? 0}</span>
                </div>
                <div className="text-sm text-muted-foreground">Reportes</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="w-5 h-5" />
              Ubicación de tu casa
            </CardTitle>
            <CardDescription>
              La usamos para calcular distancias y optimizar tus rutas de compra.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {CR_PRESETS.map((preset) => (
                <Button
                  key={preset.label}
                  variant="outline"
                  size="sm"
                  type="button"
                  onClick={() => {
                    setHomeLatitude(preset.lat.toString());
                    setHomeLongitude(preset.lng.toString());
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Latitud</Label>
                <Input
                  type="number"
                  step="0.000001"
                  placeholder="9.928100"
                  value={homeLatitude}
                  onChange={(e) => setHomeLatitude(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Longitud</Label>
                <Input
                  type="number"
                  step="0.000001"
                  placeholder="-84.090700"
                  value={homeLongitude}
                  onChange={(e) => setHomeLongitude(e.target.value)}
                />
              </div>
            </div>
            <Button variant="outline" onClick={handleGetLocation} className="w-full gap-2">
              <MapPin className="w-4 h-4" /> Usar mi ubicación actual
            </Button>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Radio de búsqueda por defecto</Label>
                <span className="text-sm text-muted-foreground">{defaultRadius[0]} km</span>
              </div>
              <Slider
                value={defaultRadius}
                onValueChange={setDefaultRadius}
                min={1}
                max={50}
                step={1}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Costos personales
            </CardTitle>
            <CardDescription>
              Usados por el Carrito Inteligente para decidir entre una o varias tiendas.
              Valores actuales: {formatCurrency(parseFloat(fuelCost) || 0)}/km y{" "}
              {formatCurrency(parseFloat(timeValue) || 0)}/hora.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Combustible por km (₡)</Label>
              <Input
                type="number"
                step="10"
                placeholder="250"
                value={fuelCost}
                onChange={(e) => setFuelCost(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Referencia: un sedán con gasolina a ₡700/L consume ~₡250/km.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Valor de tu hora (₡)</Label>
              <Input
                type="number"
                step="100"
                placeholder="3000"
                value={timeValue}
                onChange={(e) => setTimeValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Cuánto vale tu tiempo. Influye en si dos viajes cortos compiten con uno largo.
              </p>
            </div>
          </CardContent>
        </Card>

        {isAdmin && <AdminLlmConfig />}

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Integraciones
            </CardTitle>
            <CardDescription>
              Conectá tu cuenta de Auto Mercado para incluir sus precios en el optimizador.
              Las credenciales se guardan encriptadas (AES-256-GCM) en nuestra base.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">Auto Mercado</div>
                  {automercadoCred ? (
                    <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      {automercadoCred.lastError ? (
                        <>
                          <AlertTriangle className="w-3 h-3 text-destructive" />
                          <span className="text-destructive">
                            Error: {automercadoCred.lastError}
                          </span>
                        </>
                      ) : automercadoCred.lastVerifiedAt ? (
                        <>
                          <CheckCircle2 className="w-3 h-3 text-green-600" />
                          Verificado {new Date(automercadoCred.lastVerifiedAt).toLocaleDateString("es-CR")}
                        </>
                      ) : (
                        <span>Conectado · sin verificar todavía</span>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-1">No conectado</div>
                  )}
                </div>
                {automercadoCred && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (confirm("¿Eliminar tus credenciales de Auto Mercado?")) {
                        deleteIntegration.mutate({ id: automercadoCred.id });
                      }
                    }}
                    aria-label="Eliminar credenciales"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  type="email"
                  placeholder="correo@automercado.cr"
                  value={amEmail}
                  onChange={(e) => setAmEmail(e.target.value)}
                  autoComplete="off"
                />
                <Input
                  type="password"
                  placeholder="Contraseña"
                  value={amPassword}
                  onChange={(e) => setAmPassword(e.target.value)}
                  autoComplete="new-password"
                />
              </div>
              <Button
                size="sm"
                className="w-full"
                disabled={!amEmail || !amPassword || saveIntegration.isPending}
                onClick={() =>
                  saveIntegration.mutate({
                    integration: "automercado",
                    email: amEmail,
                    password: amPassword,
                  })
                }
              >
                {saveIntegration.isPending ? "Encriptando..." : automercadoCred ? "Reemplazar credenciales" : "Conectar Auto Mercado"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Nunca enviamos tu contraseña a terceros. Solo nuestro scraper la usa para iniciar sesión en automercado.cr.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-4">
          <Button
            onClick={handleSave}
            disabled={updateLocation.isPending || updatePreferences.isPending}
            className="flex-1 gap-2"
          >
            <Save className="w-4 h-4" />
            {(updateLocation.isPending || updatePreferences.isPending) ? "Guardando..." : "Guardar cambios"}
          </Button>
          <Button variant="outline" onClick={handleLogout} className="gap-2">
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </Button>
        </div>
      </main>
    </div>
  );
}
