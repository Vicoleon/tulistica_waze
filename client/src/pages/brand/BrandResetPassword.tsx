import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { toast } from "sonner";

export default function BrandResetPassword() {
  const [, navigate] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const resetMutation = trpc.brandAuth.resetPassword.useMutation();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  const missingToken = useMemo(() => token === null || token.length === 0, [token]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      await resetMutation.mutateAsync({ token, newPassword: password });
      setDone(true);
      setTimeout(() => navigate("/brand/login"), 1500);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Reset failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          {done ? (
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
          ) : missingToken ? (
            <XCircle className="w-10 h-10 mx-auto text-destructive" />
          ) : (
            <KeyRound className="w-10 h-10 mx-auto text-primary" />
          )}
          <CardTitle>
            {done
              ? "Password updated"
              : missingToken
                ? "Missing reset token"
                : "Choose a new password"}
          </CardTitle>
          <CardDescription>
            {done
              ? "Redirecting you to sign in…"
              : missingToken
                ? "Open the link from the reset email again."
                : "Use at least 8 characters."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!done && !missingToken && (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <Button type="submit" className="w-full" disabled={resetMutation.isPending}>
                {resetMutation.isPending ? "Updating…" : "Update password"}
              </Button>
            </form>
          )}
          {(done || missingToken) && (
            <Link href="/brand/login">
              <Button className="w-full" variant="outline">
                Back to sign in
              </Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
