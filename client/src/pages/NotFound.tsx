import { Button } from "@/components/ui/button";
import { Receipt } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const handleGoHome = () => {
    setLocation(isAuthenticated ? "/dashboard" : "/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-xl text-center">
        <div className="flex justify-center mb-8">
          <div className="w-24 h-24 rounded-full bg-paper-deep flex items-center justify-center shadow-paper">
            <Receipt className="w-12 h-12 text-muted-foreground/40" strokeWidth={1.4} />
          </div>
        </div>

        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-4">
          404 · sin recibo
        </p>

        <h1 className="font-serif text-4xl sm:text-5xl text-foreground leading-tight mb-4">
          Esta página se quedó <span className="italic text-primary">sin recibo</span>.
        </h1>

        <p className="text-muted-foreground text-base sm:text-lg mb-8 max-w-md mx-auto">
          La buscamos en todos los pasillos pero no la encontramos.
        </p>

        <div className="flex justify-center">
          <Button
            onClick={handleGoHome}
            className="h-12 rounded-full px-6 gap-2"
          >
            {isAuthenticated ? "Volver a mi lista" : "Volver al inicio"}
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-12">
          Si llegaste acá desde un enlace, contanos —
          <span className="font-mono"> hola@tulistica.com</span>
        </p>
      </div>
    </div>
  );
}
