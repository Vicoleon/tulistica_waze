import { useEffect, useState, type FormEvent } from "react";
import { Link } from "wouter";
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
      toast.success("Profile updated");
    },
    onError: err => toast.error(err.message),
  });

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [taxId, setTaxId] = useState("");

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

  return (
    <BrandLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-sm text-muted-foreground">Company profile and credentials.</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Company profile</CardTitle>
            <CardDescription>Visible on invoices.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="company">Company name</Label>
                  <Input
                    id="company"
                    required
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="contact">Contact name</Label>
                  <Input id="contact" value={contactName} onChange={e => setContactName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="country">Country</Label>
                  <Input id="country" value={country} onChange={e => setCountry(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="billing">Billing email</Label>
                  <Input id="billing" type="email" value={billingEmail} onChange={e => setBillingEmail(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="tax">Tax ID</Label>
                  <Input id="tax" value={taxId} onChange={e => setTaxId(e.target.value)} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={updateProfile.isPending}>
                  {updateProfile.isPending ? "Saving…" : "Save profile"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change password</CardTitle>
            <CardDescription>
              Password management moved to your personal account. Use the password
              reset flow there to change your sign-in password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/forgot-password">
              <Button variant="outline">Reset password</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </BrandLayout>
  );
}
