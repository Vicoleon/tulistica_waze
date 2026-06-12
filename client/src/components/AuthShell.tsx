import type { ReactNode } from "react";
import { Link } from "wouter";
import { BrandMark } from "@/components/BrandMark";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface AuthShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * The one auth surface: porcelain background, the BrandMark lockup top-left,
 * a single centered card with one title scale. Every auth page (sign-in,
 * forgot/reset password, verify email) renders inside this shell so the brand
 * never changes identity between screens.
 */
export function AuthShell({ title, description, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 pt-6 sm:px-10 sm:pt-8">
        <Link href="/" className="inline-flex" aria-label="Tulistica — volver al inicio">
          <BrandMark withTagline />
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 pt-12 pb-16 sm:pt-20">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-serif text-3xl font-semibold tracking-tight">
              {title}
            </CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
        {footer && (
          <div className="mt-6 w-full max-w-md text-center text-sm text-muted-foreground">
            {footer}
          </div>
        )}
      </main>
    </div>
  );
}
