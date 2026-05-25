import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import {
  MapPin, Barcode, ShoppingCart, Users, TrendingDown, Trophy,
  ChefHat, Package, Sparkles, ArrowRight, CheckCircle2
} from "lucide-react";
import { Link } from "wouter";

const features = [
  {
    icon: MapPin,
    title: "Buscador inteligente de tiendas",
    description:
      "Encontrá supermercados cercanos en Costa Rica con comparación de precios en tiempo real.",
  },
  {
    icon: TrendingDown,
    title: "Carrito Inteligente",
    description:
      "Nuestro algoritmo decide si conviene ir a una sola tienda o dividir la compra para ahorrar más.",
  },
  {
    icon: Barcode,
    title: "Escáner de códigos",
    description:
      "Escaneá productos en la tienda para reportar precios y ayudar a la comunidad.",
  },
  {
    icon: Users,
    title: "Listas compartidas",
    description:
      "Compartí listas con tu familia o roomies y vean actualizaciones en tiempo real.",
  },
  {
    icon: ChefHat,
    title: "De receta a lista",
    description:
      "Pegá el enlace de una receta y extraemos los ingredientes directo a tu lista de compras.",
  },
  {
    icon: Package,
    title: "Control de despensa",
    description:
      "Llevá registro de tu despensa y recibí recordatorios cuando algo se está acabando.",
  },
];

const steps = [
  { step: "1", title: "Hacé tu lista", desc: "Creá una lista o importá los ingredientes de una receta." },
  { step: "2", title: "Compará precios", desc: "Comparamos precios en las tiendas cerca de tu ubicación." },
  { step: "3", title: "Comprá y ahorrá", desc: "Seguí la ruta optimizada y reportá los nuevos precios." },
];

const communityBenefits = [
  "Ganás puntos por cada precio reportado",
  "Construís confianza con reportes verificados",
  "Competí en rankings semanales y mensuales",
  "Desbloqueás logros y medallas",
];

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const currentYear = new Date().getFullYear();

  const { data: leaderboard } = trpc.gamification.getLeaderboard.useQuery({
    period: "weekly",
    limit: 3,
  });

  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
              <ShoppingCart className="w-6 h-6 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold text-foreground">Grocery Waze</span>
          </Link>
          <div className="flex items-center gap-4">
            {isAuthenticated ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost">Mi tablero</Button>
                </Link>
                <Link href="/profile">
                  <Button variant="outline">{user?.name || "Perfil"}</Button>
                </Link>
              </>
            ) : (
              <a href={getLoginUrl()}>
                <Button>Iniciar sesión</Button>
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10" />
        <div className="container py-24 md:py-32 relative">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-6">
              <Sparkles className="w-4 h-4" />
              <span className="text-sm font-medium">Inteligencia colaborativa para tu compra en Costa Rica</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
              Pagá menos en cada
              <span className="text-primary"> compra del super</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
              Compará precios entre Walmart, Auto Mercado, Más x Menos, Palí y más.
              Optimizá tu ruta y unite a una comunidad que ahorra colones todos los días.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {isAuthenticated ? (
                <Link href="/dashboard">
                  <Button size="lg" className="gap-2">
                    Ir a mi tablero <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              ) : (
                <a href={getLoginUrl()}>
                  <Button size="lg" className="gap-2">
                    Empezar a ahorrar <ArrowRight className="w-4 h-4" />
                  </Button>
                </a>
              )}
              <Link href="/map">
                <Button size="lg" variant="outline" className="gap-2">
                  <MapPin className="w-4 h-4" /> Ver tiendas
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Todo lo que necesitás para comprar más inteligente
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Herramientas pensadas para encontrar los mejores precios, planear tus viajes y ahorrar.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <Card key={i} className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                <CardHeader>
                  <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4 group-hover:bg-primary/20 transition-colors">
                    <feature.icon className="w-6 h-6 text-primary" />
                  </div>
                  <CardTitle>{feature.title}</CardTitle>
                  <CardDescription>{feature.description}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-muted/50">
        <div className="container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Así funciona
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((item, i) => (
              <div key={i} className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground text-2xl font-bold flex items-center justify-center mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community Section */}
      <section className="py-24">
        <div className="container">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-6">
                Unite a la comunidad de compradores inteligentes
              </h2>
              <p className="text-lg text-muted-foreground mb-8">
                Los precios que ves vienen de personas como vos. Reportá precios,
                ganá puntos y subí en el ranking mientras ayudás a que todos ahorren.
              </p>
              <ul className="space-y-4">
                {communityBenefits.map((item, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary flex-shrink-0" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
              <Link href="/leaderboard">
                <Button className="mt-8 gap-2">
                  <Trophy className="w-4 h-4" /> Ver tabla de líderes
                </Button>
              </Link>
            </div>
            <Card className="p-8">
              <div className="space-y-4">
                {leaderboard && leaderboard.length > 0 ? (
                  leaderboard.slice(0, 3).map((entry, idx) => {
                    const badges = ["🥇", "🥈", "🥉"];
                    return (
                      <div
                        key={entry.userId}
                        className="flex items-center gap-4 p-4 rounded-lg bg-muted/50"
                      >
                        <span className="text-2xl">{badges[idx]}</span>
                        <div className="flex-1">
                          <div className="font-semibold">Reportero #{entry.userId}</div>
                          <div className="text-sm text-muted-foreground">
                            {entry.points?.toLocaleString("es-CR") ?? 0} puntos esta semana
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <Trophy className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="font-medium">Sé el primero en aparecer aquí</p>
                    <p className="text-sm mt-1">
                      Reportá precios esta semana y empezá a sumar puntos.
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-primary text-primary-foreground">
        <div className="container text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">
            ¿Listo para ahorrar?
          </h2>
          <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
            Sumate y empezá a recortar tu factura del supermercado.
          </p>
          {isAuthenticated ? (
            <Link href="/dashboard">
              <Button size="lg" variant="secondary" className="gap-2">
                Ir a mi tablero <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          ) : (
            <a href={getLoginUrl()}>
              <Button size="lg" variant="secondary" className="gap-2">
                Crear cuenta gratis <ArrowRight className="w-4 h-4" />
              </Button>
            </a>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <ShoppingCart className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold">Grocery Waze</span>
            </div>
            <nav className="flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
              <Link href="/legal/terms" className="hover:text-foreground">
                Términos
              </Link>
              <Link href="/legal/privacy" className="hover:text-foreground">
                Privacidad
              </Link>
              <Link href="/map" className="hover:text-foreground">
                Tiendas
              </Link>
              <Link href="/leaderboard" className="hover:text-foreground">
                Comunidad
              </Link>
            </nav>
            <div className="text-sm text-muted-foreground">
              © {currentYear} Grocery Waze · Hecho para Costa Rica
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
