import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Mail } from "lucide-react";

export default function BrandForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const requestMutation = trpc.brandAuth.requestPasswordReset.useMutation();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await requestMutation.mutateAsync({ email });
    setSent(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          {sent ? (
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
          ) : (
            <Mail className="w-10 h-10 mx-auto text-primary" />
          )}
          <CardTitle>{sent ? "Check your inbox" : "Reset your password"}</CardTitle>
          <CardDescription>
            {sent
              ? "If an account exists for that email, we sent reset instructions."
              : "Enter your work email and we'll send a reset link."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sent ? (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Work email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={requestMutation.isPending}>
                {requestMutation.isPending ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          ) : (
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
