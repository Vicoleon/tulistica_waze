import { useEffect, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  ArrowLeft, MapPin, DollarSign, Clock, Save, LogOut,
  Shield, Award, TrendingUp, Pencil, Plus, Loader2, Lock,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { getLoginUrl } from "@/const";

const FAVORITE_STORES_PLACEHOLDER = ["AutoMercado Escazú", "PriceSmart Heredia", "Walmart Multiplaza"];

export default function Profile() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, setLocation] = useLocation();

  // Edit profile modal
  const [editOpen, setEditOpen] = useState(false);
  const [editName, setEditName] = useState("");

  // Location & preferences
  const [homeLatitude, setHomeLatitude] = useState("");
  const [homeLongitude, setHomeLongitude] = useState("");
  const [defaultRadius, setDefaultRadius] = useState([10]);
  const [fuelCost, setFuelCost] = useState("0.15");
  const [timeValue, setTimeValue] = useState("15");

  // Soft preferences (visual-only, marked TODO)
  const [notificationsOn, setNotificationsOn] = useState(true);

  const utils = trpc.useUtils();
  const updateLocation = trpc.user.updateLocation.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
    },
  });

  const updatePreferences = trpc.user.updatePreferences.useMutation({
    onSuccess: () => {
      utils.auth.me.invalidate();
      toast.success("Listo — tus preferencias quedaron guardadas.");
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    if (user) {
      setEditName(user.name ?? "");
      setHomeLatitude(user.homeLatitude?.toString() || "");
      setHomeLongitude(user.homeLongitude?.toString() || "");
      setDefaultRadius([user.defaultRadiusKm || 10]);
      setFuelCost(user.fuelCostPerKm?.toString() || "0.15");
      setTimeValue(user.timeValuePerHour?.toString() || "15");
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
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setHomeLatitude(pos.coords.latitude.toFixed(6));
          setHomeLongitude(pos.coords.longitude.toFixed(6));
          toast.success("Listo — usamos tu ubicación actual.");
        },
        () => toast.error("No pudimos leer tu ubicación.")
      );
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.success("Hasta pronto.");
    setLocation("/");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const url = getLoginUrl();
    if (url) {
      window.location.href = url;
      return null;
    }
    return (
      <div className="min-h-screen flex items-center justify-center p-6 text-center">
        <p className="text-muted-foreground">
          Sign-in isn't configured in this environment.
        </p>
      </div>
    );
  }

  const initial = (user?.name?.[0] ?? user?.email?.[0] ?? "?").toUpperCase();
  const savingProfile = updateLocation.isPending || updatePreferences.isPending;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card/80 backdrop-blur sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" aria-label="Volver al inicio">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex flex-col leading-tight">
            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Comunidad
            </span>
            <span className="font-serif text-lg text-foreground">Mi perfil</span>
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-3xl">
        <section className="mb-8">
          <h1 className="font-serif text-3xl md:text-4xl text-foreground tracking-tight">
            Mi perfil
          </h1>
          <p className="mt-2 text-muted-foreground max-w-2xl">
            Tu cuenta, tus tiendas favoritas, tus preferencias.
          </p>
        </section>

        {/* Top user card */}
        <Card className="rounded-3xl shadow-paper border-border/60 mb-6">
          <CardContent className="p-6 md:p-7">
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 shadow-paper">
                <span className="font-serif text-3xl">{initial}</span>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-serif text-2xl truncate">{user?.name || "Vecino"}</h2>
                <p className="text-muted-foreground truncate">{user?.email}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full h-11 gap-1 shrink-0"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="w-4 h-4" /> Editar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats row */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          <StatPill
            label="₡ ahorrados"
            value={(((user?.priceReportsCount ?? 0) * 350)).toLocaleString("es-CR")}
            tone="bg-sage-soft text-secondary-foreground"
          />
          <StatPill
            label="Reportes"
            value={(user?.priceReportsCount ?? 0).toLocaleString("es-CR")}
            tone="bg-peach-soft text-accent-foreground"
          />
          <StatPill
            label="Ranking"
            value={user?.totalPoints ? `#${Math.max(1, Math.round(2000 / Math.max(1, user.totalPoints)))}` : "—"}
            tone="bg-butter-soft text-butter-foreground"
          />
          <StatPill
            label="Confianza"
            value={(user?.trustScore ?? 10).toString()}
            tone="bg-rose-soft text-rose-foreground"
          />
        </section>

        {/* Tu hogar */}
        <SectionCard
          eyebrow="Tu hogar"
          title="La lista es de toda la familia."
          description="Invitá a quienes comparten la lista del super con vos."
        >
          <div className="space-y-2 mb-4">
            <MemberRow name={user?.name || "Vos"} role="Dueño de la lista" initial={initial} />
            {/* TODO: wire to lists.getMembers when family-account hook lands. */}
          </div>
          <Button variant="outline" className="rounded-full h-11 gap-2">
            <Plus className="w-4 h-4" /> Invitar a alguien
          </Button>
        </SectionCard>

        {/* Tiendas favoritas */}
        <SectionCard
          eyebrow="Tiendas favoritas"
          title="Donde más comprás."
          description="Las marcamos como tu base — aparecen primero en mapas y precios."
        >
          <div className="flex flex-wrap gap-2 mb-4">
            {FAVORITE_STORES_PLACEHOLDER.map((store) => (
              <span
                key={store}
                className="inline-flex items-center gap-2 rounded-full bg-peach-soft text-accent-foreground px-4 h-10 text-sm"
              >
                {store}
                <button
                  type="button"
                  aria-label={`Quitar ${store}`}
                  className="text-accent-foreground/60 hover:text-accent-foreground"
                  // TODO: wire to user.removeFavoriteStore
                  onClick={() => toast("Vamos a guardar tu cambio pronto.")}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <Button variant="outline" className="rounded-full h-11 gap-2">
            <Plus className="w-4 h-4" /> Agregar tienda
          </Button>
        </SectionCard>

        {/* Preferencias */}
        <SectionCard
          eyebrow="Preferencias"
          title="Cómo querés que te avisemos."
        >
          <div className="space-y-1">
            <ToggleRow
              icon={<TrendingUp className="w-4 h-4" />}
              title="Notificaciones de precios"
              description="Cuando algo de tu lista baja de precio, te avisamos."
              checked={notificationsOn}
              onCheckedChange={setNotificationsOn}
            />
            <RadioRow
              title="Idioma"
              options={[{ key: "es", label: "Español" }]}
              value="es"
            />
            <RadioRow
              title="Moneda"
              options={[{ key: "crc", label: "Colones ₡" }]}
              value="crc"
            />
            <RadioRow
              title="Modo"
              options={[
                { key: "auto", label: "Auto" },
                { key: "light", label: "Claro" },
                { key: "dark", label: "Oscuro" },
              ]}
              value="light"
              // TODO: wire to ThemeProvider when supported.
            />
          </div>
        </SectionCard>

        {/* Hogar (ubicación) */}
        <SectionCard
          eyebrow="Ubicación"
          title="Desde dónde calculamos las distancias."
          description="Para mostrarte tiendas cerca y rutas que valgan la pena."
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-sm">Latitud</Label>
              <Input
                type="number"
                step="0.000001"
                placeholder="9.9333"
                value={homeLatitude}
                onChange={(e) => setHomeLatitude(e.target.value)}
                className="rounded-xl h-11 font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Longitud</Label>
              <Input
                type="number"
                step="0.000001"
                placeholder="-84.0833"
                value={homeLongitude}
                onChange={(e) => setHomeLongitude(e.target.value)}
                className="rounded-xl h-11 font-mono"
              />
            </div>
          </div>
          <Button
            variant="outline"
            onClick={handleGetLocation}
            className="rounded-full h-11 gap-2 mt-3 w-full sm:w-auto"
          >
            <MapPin className="w-4 h-4" /> Usar ubicación actual
          </Button>

          <div className="space-y-3 mt-6 pt-6 border-t border-border">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Radio para buscar tiendas</Label>
              <span className="text-sm text-muted-foreground font-mono">{defaultRadius[0]} km</span>
            </div>
            <Slider
              value={defaultRadius}
              onValueChange={setDefaultRadius}
              min={1}
              max={50}
              step={1}
            />
          </div>
        </SectionCard>

        {/* Costos */}
        <SectionCard
          eyebrow="Cálculo del mandado"
          title="Cuánto vale tu tiempo y la gasolina."
          description="Lo usamos para decirte si vale la pena cambiar de tienda."
        >
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Gasolina por km
              </Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">₡</span>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="120"
                  value={fuelCost}
                  onChange={(e) => setFuelCost(e.target.value)}
                  className="pl-9 rounded-xl h-11 font-mono"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm flex items-center gap-2">
                <Clock className="w-4 h-4" /> Tu hora vale
              </Label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">₡</span>
                <Input
                  type="number"
                  step="1"
                  placeholder="3000"
                  value={timeValue}
                  onChange={(e) => setTimeValue(e.target.value)}
                  className="pl-9 rounded-xl h-11 font-mono"
                />
              </div>
            </div>
          </div>
        </SectionCard>

        <div className="flex flex-col sm:flex-row gap-3 mb-10">
          <Button
            onClick={handleSave}
            disabled={savingProfile}
            className="sm:flex-1 h-12 rounded-full gap-2"
          >
            {savingProfile ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Guardando…
              </>
            ) : (
              <>
                <Save className="w-4 h-4" /> Guardar cambios
              </>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={handleLogout}
            className="h-12 rounded-full gap-2"
          >
            <LogOut className="w-4 h-4" /> Cerrar sesión
          </Button>
        </div>

        {/* Cuenta */}
        <SectionCard
          eyebrow="Cuenta"
          title="Las cosas serias."
          description="Cambios sensibles — los protegemos detrás de una confirmación."
        >
          <div className="space-y-2">
            <button
              type="button"
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-card border border-border hover:bg-paper-deep transition-colors min-h-11 text-left"
              onClick={() => toast("Te enviamos un correo para cambiar la clave.")}
              // TODO: wire to auth.requestPasswordReset.
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-paper-deep flex items-center justify-center">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                </div>
                <div>
                  <div className="font-serif text-base">Cambiar contraseña</div>
                  <div className="text-xs text-muted-foreground">
                    Te enviamos un correo con el paso a paso.
                  </div>
                </div>
              </div>
              <span className="text-muted-foreground">›</span>
            </button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-card border border-destructive/30 hover:bg-rose-soft transition-colors min-h-11 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-rose-soft flex items-center justify-center">
                      <Shield className="w-4 h-4 text-destructive" />
                    </div>
                    <div>
                      <div className="font-serif text-base text-destructive">
                        Eliminar cuenta
                      </div>
                      <div className="text-xs text-muted-foreground">
                        Tu cuenta y tu historial se borran para siempre.
                      </div>
                    </div>
                  </div>
                  <span className="text-destructive">›</span>
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-serif text-2xl">
                    ¿Eliminar tu cuenta?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Tu lista, tu despensa, tus puntos y tu historial se borran. No hay vuelta atrás.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => toast.warning("Vamos a contactarte para confirmar.") /* TODO: wire to user.deleteAccount */ }
                  >
                    Eliminar para siempre
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </SectionCard>

        <p className="text-xs text-muted-foreground text-center mt-12 mb-4">
          <Award className="w-3 h-3 inline mr-1" />
          Gracias por hacer que la lista del super de Costa Rica sea más barata.
        </p>
      </main>

      {/* Edit profile modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Editar perfil</DialogTitle>
            <DialogDescription>
              Cómo querés que te llamemos en la app.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label className="text-sm">Nombre</Label>
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="rounded-xl h-12"
                placeholder="Tu nombre"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Correo</Label>
              <Input
                value={user?.email ?? ""}
                disabled
                className="rounded-xl h-12 font-mono text-sm"
              />
            </div>
            <Button
              className="w-full h-11 rounded-full gap-2"
              onClick={() => {
                // TODO: wire to user.updateProfile when the mutation exists.
                setEditOpen(false);
                toast.success("Listo — tu nombre quedó actualizado.");
              }}
            >
              <Save className="w-4 h-4" /> Guardar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatPill({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <Card className={`rounded-3xl border-border/60 ${tone}`}>
      <CardContent className="p-4 md:p-5">
        <div className="text-[11px] uppercase tracking-[0.14em] opacity-80">{label}</div>
        <div className="font-serif text-3xl mt-1 leading-none">{value}</div>
      </CardContent>
    </Card>
  );
}

function SectionCard({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-3xl shadow-paper border-border/60 mb-6">
      <CardContent className="p-6 md:p-7">
        <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground mb-1">
          {eyebrow}
        </div>
        <h3 className="font-serif text-xl">{title}</h3>
        {description ? (
          <p className="text-sm text-muted-foreground mt-1 mb-5">{description}</p>
        ) : (
          <div className="mb-5" />
        )}
        {children}
      </CardContent>
    </Card>
  );
}

function MemberRow({ name, role, initial }: { name: string; role: string; initial: string }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl bg-card border border-border/50">
      <div className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-serif text-sm">
        {initial}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-serif text-base truncate">{name}</div>
        <div className="text-xs text-muted-foreground">{role}</div>
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  title,
  description,
  checked,
  onCheckedChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-dashed border-border last:border-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-9 h-9 rounded-full bg-paper-deep flex items-center justify-center text-muted-foreground shrink-0">
          {icon}
        </div>
        <div className="min-w-0">
          <div className="font-serif text-base">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function RadioRow({
  title,
  options,
  value,
}: {
  title: string;
  options: { key: string; label: string }[];
  value: string;
}) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-3 border-b border-dashed border-border last:border-0">
      <div className="font-serif text-base">{title}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = opt.key === value;
          return (
            <span
              key={opt.key}
              className={`inline-flex items-center rounded-full h-9 px-3 text-sm transition-colors ${
                active
                  ? "bg-foreground text-background"
                  : "bg-card border border-border text-muted-foreground"
              }`}
            >
              {opt.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
