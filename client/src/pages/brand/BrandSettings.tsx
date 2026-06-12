import { useEffect, useState, type FormEvent } from "react";
import { BrandLayout } from "@/components/BrandLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { useBrandAuth } from "@/hooks/useBrandAuth";

export default function BrandSettings() {
  const { brand, refetch } = useBrandAuth();
  const updateProfile = trpc.brandAuth.updateProfile.useMutation({
    onSuccess: async () => {
      await refetch();
      toast.success("Perfil actualizado");
    },
    onError: err => toast.error(err.message),
  });
  const changePassword = trpc.brandAuth.changePassword.useMutation({
    onSuccess: () => toast.success("Contraseña actualizada"),
    onError: err => toast.error(err.message),
  });

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [taxId, setTaxId] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    if (!brand) return;
    setCompanyName(brand.companyName ?? "");
    setContactName(brand.contactName ?? "");
    setPhone(brand.phone ?? "");
    setCountry(brand.country ?? "");
    setBillingEmail(brand.billingEmail ?? "");
    setTaxId(brand.taxId ?? "");
  }, [brand]);

  const onSaveProfile = (e: FormEvent) => {
    e.preventDefault();
    updateProfile.mutate({
      companyName,
      contactName: contactName || undefined,
      phone: phone || undefined,
      country: country || undefined,
      billingEmail: billingEmail || undefined,
      taxId: taxId || undefined,
    });
  };

  const onChangePassword = (e: FormEvent) => {
    e.preventDefault();
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword("");
          setNewPassword("");
        },
      }
    );
  };

  return (
    <BrandLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Configuración</h1>
          <p className="text-sm text-muted-foreground">Perfil de la empresa y credenciales.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Perfil de la empresa</CardTitle>
            <CardDescription>Aparece en tus facturas.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="company">Nombre de la empresa</Label>
                  <Input
                    id="company"
                    required
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact">Nombre de contacto</Label>
                  <Input id="contact" value={contactName} onChange={e => setContactName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Teléfono</Label>
                  <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="country">País</Label>
                  <Input id="country" value={country} onChange={e => setCountry(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="billing">Correo de facturación</Label>
                  <Input id="billing" type="email" value={billingEmail} onChange={e => setBillingEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tax">Cédula jurídica</Label>
                  <Input id="tax" value={taxId} onChange={e => setTaxId(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? "Guardando…" : "Guardar perfil"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cambiar contraseña</CardTitle>
            <CardDescription>Usá al menos 8 caracteres.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onChangePassword} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="currentPassword">Contraseña actual</Label>
                <Input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="newPassword">Nueva contraseña</Label>
                <Input
                  id="newPassword"
                  type="password"
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={changePassword.isPending}>
                  {changePassword.isPending ? "Actualizando…" : "Actualizar contraseña"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </BrandLayout>
  );
}
