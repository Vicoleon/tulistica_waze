import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-6 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl rounded-3xl border bg-card p-10 shadow-paper">
            <div className="w-16 h-16 rounded-full bg-rose-soft text-destructive grid place-items-center mb-6">
              <AlertTriangle size={28} />
            </div>

            <h2 className="font-serif text-3xl text-center mb-2">
              Algo se nos cayó del carrito.
            </h2>
            <p className="text-muted-foreground text-center mb-6 max-w-md">
              Tu lista está a salvo. Recargá la página y seguimos donde dejamos.
            </p>

            <details className="w-full mb-6">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                Ver detalle técnico
              </summary>
              <div className="mt-3 p-4 w-full rounded-xl bg-muted overflow-auto">
                <pre className="text-xs text-muted-foreground whitespace-break-spaces font-mono">
                  {this.state.error?.stack}
                </pre>
              </div>
            </details>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "inline-flex items-center gap-2 px-6 py-3 rounded-full",
                "bg-primary text-primary-foreground font-semibold",
                "hover:-translate-y-0.5 transition-transform shadow-paper cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recargar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
