import { useEffect, useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type Status = "pending" | "success" | "error" | "missing";

export default function BrandVerifyEmail() {
  const [status, setStatus] = useState<Status>("pending");
  const [errorMessage, setErrorMessage] = useState("");
  const verifyMutation = trpc.brandAuth.verifyEmail.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (!token) {
      setStatus("missing");
      return;
    }

    verifyMutation
      .mutateAsync({ token })
      .then(async () => {
        await utils.brandAuth.me.invalidate();
        setStatus("success");
      })
      .catch(err => {
        setErrorMessage(err instanceof Error ? err.message : "Verification failed");
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/20">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-3">
          {status === "pending" && (
            <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
          )}
          {status === "success" && (
            <CheckCircle2 className="w-10 h-10 mx-auto text-green-600" />
          )}
          {(status === "error" || status === "missing") && (
            <XCircle className="w-10 h-10 mx-auto text-destructive" />
          )}
          <CardTitle>
            {status === "pending" && "Verifying your email…"}
            {status === "success" && "Email verified"}
            {status === "error" && "We couldn't verify this link"}
            {status === "missing" && "Missing verification token"}
          </CardTitle>
          <CardDescription>
            {status === "success" && "You can now publish campaigns and download invoices."}
            {status === "error" && errorMessage}
            {status === "missing" && "The link you used doesn't include a token."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link href="/brand/dashboard">
            <Button className="w-full">Go to dashboard</Button>
          </Link>
          <Link href="/brand/login" className="block text-sm text-primary hover:underline">
            Back to sign in
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
