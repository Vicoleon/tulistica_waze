import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Terms() {
  const lastUpdated = "23 de mayo, 2026";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold">Términos de Servicio</h1>
        </div>
      </header>

      <main className="container max-w-3xl py-12 prose prose-neutral dark:prose-invert">
        <p className="text-sm text-muted-foreground">
          Última actualización: {lastUpdated}
        </p>

        <h2>1. Aceptación de los términos</h2>
        <p>
          Al acceder o usar Grocery Waze (&ldquo;el Servicio&rdquo;) aceptás estos
          Términos de Servicio. Si no estás de acuerdo, no uses el Servicio.
        </p>

        <h2>2. Descripción del Servicio</h2>
        <p>
          Grocery Waze es una plataforma comunitaria de comparación de precios de
          supermercados en Costa Rica. Los precios mostrados son reportados por
          usuarios, complementados con datos de APIs públicas y pueden no estar
          siempre actualizados.
        </p>

        <h2>3. Cuenta de usuario</h2>
        <ul>
          <li>Debés tener al menos 18 años para crear una cuenta.</li>
          <li>Sos responsable de mantener la confidencialidad de tu cuenta.</li>
          <li>Aceptás proveer información veraz y mantenerla actualizada.</li>
        </ul>

        <h2>4. Conducta del usuario</h2>
        <p>Al usar Grocery Waze te comprometés a:</p>
        <ul>
          <li>Reportar precios reales y verificables.</li>
          <li>No manipular el sistema de puntos, reportes o votos.</li>
          <li>No usar el Servicio para fines ilegales o fraudulentos.</li>
          <li>No publicar contenido ofensivo, difamatorio o engañoso.</li>
        </ul>

        <h2>5. Contenido generado por usuarios</h2>
        <p>
          Vos retenés los derechos de tu contenido, pero al subirlo nos otorgás una
          licencia mundial, no exclusiva y libre de regalías para mostrarlo,
          modificarlo y distribuirlo dentro del Servicio.
        </p>

        <h2>6. Limitación de responsabilidad</h2>
        <p>
          Grocery Waze se ofrece &ldquo;tal cual&rdquo;. No garantizamos la
          exactitud de los precios, disponibilidad de productos ni características
          de las tiendas listadas. No somos responsables por pérdidas derivadas del
          uso del Servicio.
        </p>

        <h2>7. Propiedad intelectual</h2>
        <p>
          Las marcas, nombres y logos de los supermercados mencionados pertenecen
          a sus respectivos dueños. Su mención no implica afiliación, patrocinio o
          respaldo.
        </p>

        <h2>8. Modificaciones</h2>
        <p>
          Podemos actualizar estos Términos en cualquier momento. Los cambios
          entrarán en vigor al publicarse en esta página.
        </p>

        <h2>9. Ley aplicable</h2>
        <p>
          Estos Términos se rigen por las leyes de la República de Costa Rica.
          Cualquier disputa se resolverá en los tribunales de San José.
        </p>

        <h2>10. Contacto</h2>
        <p>
          Para consultas sobre estos términos, escribinos a&nbsp;
          <a href="mailto:soporte@grocerywaze.cr">soporte@grocerywaze.cr</a>.
        </p>
      </main>
    </div>
  );
}
