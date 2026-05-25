import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { ArrowRight, KeyRound, Receipt } from "lucide-react";
import { Link } from "wouter";

/**
 * Login landing. When OAuth env vars are configured, this page redirects
 * straight into the portal flow. Otherwise it explains what's missing so
 * local developers don't crash into the 404 page.
 */
export default function Login() {
  const oauthConfigured =
    Boolean(import.meta.env.VITE_OAUTH_PORTAL_URL) &&
    Boolean(import.meta.env.VITE_APP_ID);

  const loginHref = getLoginUrl();

  if (oauthConfigured && typeof window !== "undefined") {
    // Real OAuth wired: bounce immediately into the portal flow.
    window.location.replace(loginHref);
  }

  return (
    <main className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border bg-card p-10 shadow-paper">
          <div className="flex items-center gap-3 mb-8">
            <span className="w-10 h-10 rounded-full bg-primary/15 text-primary grid place-items-center">
              <Receipt className="w-5 h-5" />
            </span>
            <div>
              <p className="font-serif text-lg leading-none">tulistica</p>
              <p className="text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground mt-1">
                iniciar sesión
              </p>
            </div>
          </div>

          {oauthConfigured ? (
            <>
              <h1 className="font-serif text-4xl tracking-tight mb-3">
                Llevándote al portal de Tulistica…
              </h1>
              <p className="text-muted-foreground mb-8">
                Si en unos segundos no pasa nada, tocá el botón.
              </p>
              <a href={loginHref}>
                <Button size="lg" className="w-full rounded-full">
                  Continuar al portal
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </a>
            </>
          ) : (
            <>
              <h1 className="font-serif text-4xl tracking-tight mb-3">
                OAuth todavía no está conectado.
              </h1>
              <p className="text-muted-foreground mb-6">
                Para abrir tu cuenta de Tulistica necesitamos un portal OAuth
                configurado. En este entorno local todavía no lo está — agregalo
                a tu <code className="font-mono text-foreground">.env.local</code>{" "}
                y reiniciá <code className="font-mono text-foreground">pnpm dev</code>.
              </p>

              <div className="rounded-2xl border bg-paper-deep/60 p-5 mb-8">
                <p className="text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground mb-3">
                  variables necesarias
                </p>
                <pre className="font-mono text-sm text-foreground whitespace-pre-wrap">
{`VITE_OAUTH_PORTAL_URL=https://...
VITE_APP_ID=tu-app-id
OAUTH_SERVER_URL=https://...
JWT_SECRET=algo-secreto
DATABASE_URL=postgres://...`}
                </pre>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link href="/">
                  <Button size="lg" className="rounded-full">
                    <ArrowRight className="rotate-180 h-4 w-4 mr-1" />
                    Volver a la landing
                  </Button>
                </Link>
                <Link href="/map">
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-full"
                  >
                    <KeyRound className="h-4 w-4 mr-1" />
                    Ver lo que ya funciona sin login
                  </Button>
                </Link>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-xs font-mono uppercase tracking-[0.14em] text-muted-foreground/70 mt-6">
          © tulistica · costa rica · 2026
        </p>
      </div>
    </main>
  );
}
