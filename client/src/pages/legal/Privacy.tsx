import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "wouter";

export default function Privacy() {
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
          <h1 className="text-xl font-bold">Política de Privacidad</h1>
        </div>
      </header>

      <main className="container max-w-3xl py-12 prose prose-neutral dark:prose-invert">
        <p className="text-sm text-muted-foreground">
          Última actualización: {lastUpdated}
        </p>

        <p>
          En cumplimiento de la Ley 8968 de Protección de la Persona frente al
          Tratamiento de sus Datos Personales (Costa Rica), esta política describe
          cómo Grocery Waze recolecta, usa y protege tu información.
        </p>

        <h2>1. Datos que recolectamos</h2>
        <ul>
          <li>
            <strong>Cuenta:</strong> nombre, correo electrónico y método de
            autenticación (Google, email, etc.).
          </li>
          <li>
            <strong>Preferencias:</strong> ubicación del hogar (opcional), radio
            de búsqueda, costo de combustible y valor del tiempo.
          </li>
          <li>
            <strong>Actividad:</strong> precios reportados, votos, listas creadas,
            despensa, recetas guardadas y participación en gamificación.
          </li>
          <li>
            <strong>Datos técnicos:</strong> dirección IP, navegador, dispositivo
            y eventos de uso anónimos.
          </li>
          <li>
            <strong>Ubicación geográfica:</strong> solo cuando lo activás para
            validar reportes de precio (geofence) o buscar tiendas cercanas.
          </li>
        </ul>

        <h2>2. Cómo usamos tus datos</h2>
        <ul>
          <li>Operar la plataforma y mostrar precios cerca de vos.</li>
          <li>Validar reportes de precios y prevenir fraude.</li>
          <li>Calcular puntos, rankings y notificaciones de alertas.</li>
          <li>Mejorar la experiencia mediante analítica agregada.</li>
        </ul>

        <h2>3. Bases legales</h2>
        <ul>
          <li>Consentimiento al crear tu cuenta y aceptar estos términos.</li>
          <li>Ejecución de un contrato para entregar el servicio solicitado.</li>
          <li>Interés legítimo en mantener la seguridad de la plataforma.</li>
        </ul>

        <h2>4. Compartir con terceros</h2>
        <p>
          No vendemos tus datos. Compartimos solo con proveedores estrictamente
          necesarios:
        </p>
        <ul>
          <li>Proveedor de autenticación (OAuth) para iniciar sesión.</li>
          <li>Google Maps Platform para búsqueda de tiendas y mapas.</li>
          <li>Open Food Facts para enriquecer datos de productos.</li>
          <li>Servicio de almacenamiento en la nube (datos cifrados en tránsito).</li>
        </ul>

        <h2>5. Tus derechos</h2>
        <p>
          Bajo la Ley 8968 podés ejercer en cualquier momento los derechos de
          acceso, rectificación, cancelación y oposición (derechos ARCO) escribiendo
          a&nbsp;
          <a href="mailto:privacidad@grocerywaze.cr">privacidad@grocerywaze.cr</a>.
        </p>

        <h2>6. Retención y eliminación</h2>
        <p>
          Conservamos tus datos mientras tu cuenta esté activa. Podés solicitar la
          eliminación en cualquier momento; los reportes de precio se anonimizan
          para mantener la integridad del histórico de la comunidad.
        </p>

        <h2>7. Seguridad</h2>
        <p>
          Aplicamos cifrado en tránsito (HTTPS), tokens de sesión firmados y
          controles de acceso por roles. Ningún sistema es 100% seguro; te
          notificaremos en caso de incidente que afecte tus datos.
        </p>

        <h2>8. Cookies</h2>
        <p>
          Usamos cookies de sesión para autenticación y, opcionalmente, una cookie
          de analítica anonimizada para entender el uso del servicio.
        </p>

        <h2>9. Menores</h2>
        <p>
          El servicio no está dirigido a menores de 18 años. Si detectamos una
          cuenta de un menor, será eliminada.
        </p>

        <h2>10. Cambios</h2>
        <p>
          Notificaremos cambios materiales por correo electrónico o desde la
          aplicación con al menos 15 días de antelación.
        </p>

        <h2>11. Contacto</h2>
        <p>
          Responsable: Grocery Waze. Correo:&nbsp;
          <a href="mailto:privacidad@grocerywaze.cr">privacidad@grocerywaze.cr</a>.
        </p>
      </main>
    </div>
  );
}
