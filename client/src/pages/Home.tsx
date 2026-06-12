import { useAuth } from "@/_core/hooks/useAuth";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  ArrowRight,
  Bell,
  Check,
  ChefHat,
  MapPin,
  Menu,
  Package,
  ScanLine,
  Scale,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

interface FeatureTile {
  icon: typeof MapPin;
  title: string;
  body: string;
  bg: string;
  iconColor: string;
}

interface ComparatorRow {
  store: string;
  area: string;
  price: string;
  isBest?: boolean;
  isWorst?: boolean;
}

interface ListItem {
  name: string;
  detail: string;
  price: string;
}

const HERO_LIST: ListItem[] = [
  { name: "Arroz Tío Pelón", detail: "1 kg", price: "₡ 1.290" },
  { name: "Frijoles negros", detail: "900 g", price: "₡ 1.450" },
  { name: "Aceite Capullo", detail: "1 L", price: "₡ 2.190" },
  { name: "Pollo entero", detail: "1.8 kg", price: "₡ 4.200" },
  { name: "Cilantro fresco", detail: "1 manojo", price: "₡ 380" },
];

const COMPARATOR_ROWS: ComparatorRow[] = [
  { store: "Pali Curridabat", area: "a 1.2 km", price: "₡ 11.840", isBest: true },
  { store: "Auto Mercado Plaza del Sol", area: "a 2.4 km", price: "₡ 12.460" },
  { store: "Mas x Menos Zapote", area: "a 1.8 km", price: "₡ 13.100" },
  { store: "Walmart Zapote", area: "a 2.9 km", price: "₡ 13.700", isWorst: true },
];

const FEATURES: FeatureTile[] = [
  {
    icon: Users,
    title: "Lista compartida",
    body: "Toda la familia agrega lo que falta. Si su pareja añade café a las 9 a.m., usted lo ve.",
    bg: "bg-peach-soft",
    iconColor: "text-primary",
  },
  {
    icon: Scale,
    title: "Comparador de tiendas",
    body: "Su lista completa con el precio de cada tienda cerca, ordenado de barato a caro.",
    bg: "bg-sage-soft",
    iconColor: "text-secondary-foreground",
  },
  {
    icon: ChefHat,
    title: "Recetas a lista",
    body: "Pegue el link de una receta y los ingredientes caen en su lista. Sin transcribir.",
    bg: "bg-butter-soft",
    iconColor: "text-butter-foreground",
  },
  {
    icon: Package,
    title: "Despensa que avisa",
    body: "Marque lo que ya tiene en casa. Tulistica le dice cuando se le va a acabar el aceite.",
    bg: "bg-rose-soft",
    iconColor: "text-rose-foreground",
  },
  {
    icon: MapPin,
    title: "Mapa de tiendas",
    body: "187 tiendas en Costa Rica, con horarios, distancia y qué tan llenas están ahora.",
    bg: "bg-sky-soft",
    iconColor: "text-sky-foreground",
  },
  {
    icon: ScanLine,
    title: "Escanear y reportar",
    body: "Vio un precio en la góndola. Lo escanea. El barrio entero ahorra esta semana.",
    bg: "bg-card",
    iconColor: "text-primary",
  },
];

interface FooterLink {
  label: string;
  href: string;
}

interface FooterColumn {
  title: string;
  links: FooterLink[];
}

const FOOTER_COLUMNS: FooterColumn[] = [
  {
    title: "Producto",
    links: [
      { label: "Cómo funciona", href: "#asi-funciona" },
      { label: "Mapa de tiendas", href: "/map" },
      { label: "Crear cuenta", href: "/sign-in?mode=signup" },
    ],
  },
  {
    title: "Cuenta",
    links: [
      { label: "Entrar", href: "/sign-in" },
      { label: "Recuperar contraseña", href: "/forgot-password" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Términos", href: "/legal/terms" },
      { label: "Privacidad", href: "/legal/privacy" },
    ],
  },
  {
    title: "Empresas",
    links: [
      { label: "Para marcas", href: "/brand" },
      { label: "Portal de marcas", href: "/brand/register" },
    ],
  },
];

const STEPS = [
  {
    n: "1",
    title: "Escribí tu lista",
    body: "Desde el celular, durante la semana. Toda la casa puede agregar.",
    bg: "bg-peach-soft",
    text: "text-primary",
  },
  {
    n: "2",
    title: "Te decimos dónde comprar",
    body: "Comparamos tu lista en las tiendas cerca y te marcamos la más barata.",
    bg: "bg-sage-soft",
    text: "text-secondary-foreground",
  },
  {
    n: "3",
    title: "Volvés con vuelto",
    body: "Una sola parada, ruta clara, nada olvidado. Ahorrás cada sábado.",
    bg: "bg-butter-soft",
    text: "text-butter-foreground",
  },
];

export default function Home() {
  const { isAuthenticated } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  const primaryHref = isAuthenticated ? "/dashboard" : "/sign-in?mode=signup";
  const primaryLabel = isAuthenticated ? "Ir a mi lista" : "Crear mi lista — gratis";

  const menuLinkClass =
    "rounded-xl px-3 py-2.5 text-base font-medium text-foreground transition-colors duration-200 hover:bg-paper-deep";
  const quietMenuLinkClass =
    "px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground";

  return (
    <div className="min-h-screen bg-background">
      {/* Top navigation */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/85 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" aria-label="Tulistica — inicio">
            <BrandMark />
          </Link>

          {/* Desktop nav */}
          <div className="hidden items-center gap-6 md:flex">
            <a
              href="#asi-funciona"
              className="text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              Cómo funciona
            </a>
            <Link
              href="/map"
              className="text-sm font-medium text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              Ver mapa de tiendas
            </Link>
            {isAuthenticated ? (
              <Button asChild className="rounded-full">
                <Link href="/dashboard">Mi lista</Link>
              </Button>
            ) : (
              <Button asChild className="rounded-full">
                <Link href="/sign-in">Entrar</Link>
              </Button>
            )}
          </div>

          {/* Mobile menu */}
          <Sheet open={isMenuOpen} onOpenChange={setIsMenuOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Abrir menú"
              >
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetHeader className="pb-0">
                <SheetTitle className="sr-only">Menú de navegación</SheetTitle>
                <BrandMark />
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-2" aria-label="Menú móvil">
                <a href="#asi-funciona" onClick={closeMenu} className={menuLinkClass}>
                  Cómo funciona
                </a>
                <Link href="/map" onClick={closeMenu} className={menuLinkClass}>
                  Ver mapa de tiendas
                </Link>
                {isAuthenticated ? (
                  <Link href="/dashboard" onClick={closeMenu} className={menuLinkClass}>
                    Ir a mi lista
                  </Link>
                ) : (
                  <>
                    <Link href="/sign-in" onClick={closeMenu} className={menuLinkClass}>
                      Entrar
                    </Link>
                    <Link
                      href="/sign-in?mode=signup"
                      onClick={closeMenu}
                      className={menuLinkClass}
                    >
                      Crear cuenta
                    </Link>
                  </>
                )}
              </nav>
              <div className="mt-auto flex flex-col gap-1 border-t border-border px-2 pb-6 pt-4">
                <Link href="/legal/terms" onClick={closeMenu} className={quietMenuLinkClass}>
                  Términos
                </Link>
                <Link href="/legal/privacy" onClick={closeMenu} className={quietMenuLinkClass}>
                  Privacidad
                </Link>
                <Link href="/brand" onClick={closeMenu} className={quietMenuLinkClass}>
                  Para marcas
                </Link>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>

      {/* Hero — flat porcelain, no decoration */}
      <section>
        <div className="container grid gap-12 py-16 md:py-24 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-16">
          {/* Left — message */}
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1 font-serif text-xs italic tracking-[0.04em] text-muted-foreground shadow-paper">
              <Sparkles className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              La lista del super de toda Costa Rica
            </span>
            <h1 className="mt-6 font-serif text-4xl font-medium leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-[3.6rem]">
              Donde vive la lista del super{" "}
              <span className="italic text-primary deco-underline">de tu casa</span>.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
              Hace la lista de la semana de toda la familia. Comparamos precios en
              las tiendas cerca y te decimos dónde comprar para que vuelvas con{" "}
              <em className="font-serif not-italic text-foreground/85">vuelto</em>.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button
                asChild
                size="lg"
                className="h-12 gap-2 rounded-full px-6 text-base shadow-paper"
              >
                <Link href={primaryHref}>
                  {primaryLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <a
                href="#asi-funciona"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-full border border-border bg-card px-6 text-base font-medium text-foreground transition-colors duration-200 hover:border-primary/40 hover:text-primary"
              >
                Ver cómo funciona
              </a>
            </div>
            <div className="mt-6 flex items-center gap-3 text-sm text-muted-foreground">
              <div className="flex -space-x-2">
                <span className="inline-block h-7 w-7 rounded-full bg-peach-soft ring-2 ring-background" />
                <span className="inline-block h-7 w-7 rounded-full bg-sage-soft ring-2 ring-background" />
                <span className="inline-block h-7 w-7 rounded-full bg-butter-soft ring-2 ring-background" />
              </div>
              <span>
                Gratis. Sin tarjeta. Lista lista en{" "}
                <span className="font-mono font-semibold text-foreground">30 s</span>.
              </span>
            </div>
          </div>

          {/* Right — live-feeling list + comparator stack */}
          <div className="relative">
            {/* List card */}
            <div
              className="relative z-10 rounded-3xl bg-card p-6 shadow-paper-lg ring-1 ring-border/60 sm:p-7"
              role="figure"
              aria-label="Vista previa de una lista de Tulistica"
            >
              <div className="flex items-center justify-between border-b border-dashed border-border pb-4">
                <div>
                  <p className="font-serif italic text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Lista de la familia
                  </p>
                  <p className="font-serif text-lg font-semibold text-foreground">
                    Sábado de mandado
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-3 py-1 text-xs font-semibold text-secondary-foreground">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  3 en casa
                </span>
              </div>

              <ul className="mt-4 divide-y divide-dashed divide-border">
                {HERO_LIST.map((item) => (
                  <li
                    key={item.name}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-5 w-5 items-center justify-center rounded-md border border-border bg-background"
                        aria-hidden="true"
                      >
                        <Check className="h-3 w-3 text-muted-foreground/50" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.detail}</p>
                      </div>
                    </div>
                    <span className="font-mono text-sm font-semibold text-foreground">
                      {item.price}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex items-end justify-between border-t border-border pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total estimado</p>
                  <p className="font-mono text-2xl font-semibold text-foreground">
                    ₡ 11.840
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-butter px-3 py-1.5 text-xs font-semibold text-butter-foreground">
                  Ahorrás <span className="font-mono">₡ 1.860</span>
                </span>
              </div>
            </div>

            {/* Savings stamp — overlapping the list */}
            <div
              className="absolute -right-3 -top-4 z-20 hidden rotate-[8deg] rounded-2xl border-2 border-dashed border-primary/60 bg-card px-4 py-3 text-center shadow-paper sm:block"
              aria-hidden="true"
            >
              <p className="font-serif text-[10px] uppercase tracking-[0.18em] text-primary">
                Ahorro real
              </p>
              <p className="font-mono text-xl font-semibold text-primary">14 %</p>
              <p className="font-serif text-[10px] italic text-muted-foreground">
                esta semana
              </p>
            </div>

            {/* Comparator mini-card — peeking from behind */}
            <div className="relative -mt-6 ml-auto w-[88%] rotate-[-1.5deg] rounded-3xl bg-card p-5 shadow-paper ring-1 ring-border/60 sm:-mt-8">
              <div className="flex items-center justify-between">
                <p className="font-serif italic text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Comparador
                </p>
                <span className="font-mono text-[11px] text-muted-foreground">
                  4 tiendas
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {COMPARATOR_ROWS.map((row) => (
                  <li
                    key={row.store}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 ${
                      row.isBest
                        ? "bg-sage-soft"
                        : row.isWorst
                        ? "bg-rose-soft"
                        : "bg-background"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-serif text-sm font-semibold text-foreground">
                        {row.store}
                      </p>
                      <p className="text-[11px] text-muted-foreground">{row.area}</p>
                    </div>
                    <span
                      className={`font-mono text-sm font-semibold ${
                        row.isBest
                          ? "text-secondary-foreground"
                          : row.isWorst
                          ? "text-rose-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {row.price}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Live stats bar */}
      <section className="border-y border-border bg-paper-deep">
        <div className="container grid gap-3 py-6 sm:grid-cols-3 sm:gap-4">
          <div className="flex items-center gap-3 rounded-2xl bg-peach-soft px-4 py-3">
            <Store className="h-5 w-5 text-primary" aria-hidden="true" />
            <p className="text-sm text-foreground/80">
              <span className="font-mono text-base font-semibold text-foreground">187</span>{" "}
              tiendas en Costa Rica
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-sage-soft px-4 py-3">
            <Scale className="h-5 w-5 text-secondary-foreground" aria-hidden="true" />
            <p className="text-sm text-foreground/80">
              <span className="font-mono text-base font-semibold text-foreground">1.240</span>{" "}
              precios reportados hoy
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-2xl bg-butter-soft px-4 py-3">
            <Users className="h-5 w-5 text-butter-foreground" aria-hidden="true" />
            <p className="text-sm text-foreground/80">
              <span className="font-mono text-base font-semibold text-foreground">12.480</span>{" "}
              hogares activos
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 md:py-28">
        <div className="container">
          <div className="max-w-2xl">
            <p className="font-serif italic text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Para toda la semana
            </p>
            <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Una sola libreta para la{" "}
              <span className="italic text-primary">cocina, el barrio y el sábado</span>.
            </h2>
            <p className="mt-4 text-base text-muted-foreground">
              Lo que la casa necesita, vive en Tulistica. Lo abren en el carro, en el
              super, en la cocina.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className={`group rounded-3xl ${feature.bg} p-6 ring-1 ring-border/50 shadow-paper transition-all duration-200 hover:-translate-y-0.5 hover:shadow-paper-lg`}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-card/80 ring-1 ring-border/60">
                  <feature.icon className={`h-5 w-5 ${feature.iconColor}`} strokeWidth={1.6} />
                </div>
                <h3 className="mt-4 font-serif text-xl font-semibold tracking-tight text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/75">
                  {feature.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Así funciona */}
      <section id="asi-funciona" className="border-y border-border bg-paper-deep py-20 md:py-28">
        <div className="container">
          <div className="max-w-2xl">
            <p className="font-serif italic text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Así funciona
            </p>
            <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Tres pasos y volvés con{" "}
              <span className="italic text-primary">vuelto</span>.
            </h2>
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((step) => (
              <li
                key={step.n}
                className="relative rounded-3xl bg-card p-7 shadow-paper ring-1 ring-border/50"
              >
                <span
                  className={`absolute -top-5 left-7 flex h-12 w-12 items-center justify-center rounded-full ${step.bg} font-serif text-xl font-semibold ${step.text} ring-4 ring-paper-deep`}
                >
                  {step.n}
                </span>
                <h3 className="mt-3 font-serif text-xl font-semibold tracking-tight text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-foreground/75">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Comparador example — receipt aesthetic */}
      <section className="py-20 md:py-28">
        <div className="container grid gap-12 lg:grid-cols-[1fr_1.05fr] lg:items-center">
          <div>
            <p className="font-serif italic text-xs uppercase tracking-[0.16em] text-muted-foreground">
              Comparador en vivo
            </p>
            <h2 className="mt-2 font-serif text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Tu lista, las tiendas, el{" "}
              <span className="italic text-primary">ahorro real</span>.
            </h2>
            <p className="mt-4 max-w-md text-base text-muted-foreground">
              No te decimos &laquo;tal vez ahorrás&raquo;. Te decimos exactamente en
              cuál tienda y cuánto. Para esta lista de cinco productos en Curridabat
              hoy:
            </p>
            <ul className="mt-6 space-y-3">
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-sage-soft text-secondary-foreground">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm text-foreground/85">
                  Más barato: <span className="font-mono font-semibold">₡ 11.840</span> en Pali
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-soft text-rose-foreground">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm text-foreground/85">
                  Más caro: <span className="font-mono font-semibold">₡ 13.700</span> en Walmart
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-butter-soft text-butter-foreground">
                  <Check className="h-3.5 w-3.5" />
                </span>
                <span className="text-sm text-foreground/85">
                  Diferencia para tu lista:{" "}
                  <span className="font-mono font-semibold">₡ 1.860</span> en una sola compra
                </span>
              </li>
            </ul>
          </div>

          {/* Receipt card */}
          <div className="relative">
            <div
              className="rounded-3xl bg-card p-7 shadow-paper-lg ring-1 ring-border/60"
              role="figure"
              aria-label="Comparador de tiendas para la lista de ejemplo"
            >
              <div className="flex items-center justify-between border-b border-dashed border-border pb-4">
                <div>
                  <p className="font-serif italic text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Recibo del comparador
                  </p>
                  <p className="font-serif text-lg font-semibold text-foreground">
                    Lista de 5 productos · 24 may
                  </p>
                </div>
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">
                  Mejor: Pali
                </span>
              </div>

              <ul className="mt-4 space-y-2">
                {COMPARATOR_ROWS.map((row, i) => (
                  <li
                    key={row.store}
                    className={`flex items-center justify-between rounded-2xl px-4 py-3 ${
                      row.isBest
                        ? "bg-sage-soft ring-1 ring-secondary/40"
                        : row.isWorst
                        ? "bg-rose-soft"
                        : "bg-background"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span
                        className={`font-mono text-xs font-semibold ${
                          row.isBest ? "text-secondary-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-serif text-sm font-semibold text-foreground">
                          {row.store}
                        </p>
                        <p className="text-[11px] text-muted-foreground">{row.area}</p>
                      </div>
                    </div>
                    <span
                      className={`font-mono text-sm font-semibold ${
                        row.isBest
                          ? "text-secondary-foreground"
                          : row.isWorst
                          ? "text-rose-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {row.price}
                    </span>
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex items-end justify-between border-t border-dashed border-border pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">Volvés con vuelto</p>
                  <p className="font-mono text-2xl font-semibold text-primary">
                    ₡ 1.860
                  </p>
                </div>
                <p className="font-serif text-[11px] italic text-muted-foreground">
                  precios reportados por vecinos · hoy
                </p>
              </div>
            </div>
            {/* Subtle paper stamp */}
            <div
              className="absolute -left-3 -top-3 hidden rotate-[-6deg] rounded-full bg-butter px-3 py-1 font-serif text-[10px] uppercase tracking-[0.16em] text-butter-foreground shadow-paper sm:block"
              aria-hidden="true"
            >
              · Comprobado ·
            </div>
          </div>
        </div>
      </section>

      {/* Family testimonial */}
      <section className="pb-20 md:pb-28">
        <div className="container">
          <article className="mx-auto max-w-3xl rounded-3xl bg-card p-8 shadow-paper ring-1 ring-border/50 md:p-12">
            <div className="flex flex-col items-start gap-6 md:flex-row md:items-center">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-peach-soft font-serif text-2xl font-semibold text-primary ring-4 ring-background"
                aria-hidden="true"
              >
                MF
              </div>
              <div className="min-w-0">
                <p className="font-serif text-xl leading-snug text-foreground md:text-2xl">
                  &laquo;Llevo{" "}
                  <span className="font-mono font-semibold text-primary">₡ 48.000</span>{" "}
                  ahorrados este mes. Mi esposo agrega cosas desde la oficina, yo desde
                  la cocina, y el sábado salimos a una sola tienda.&raquo;
                </p>
                <p className="mt-4 text-sm text-muted-foreground">
                  María F. · Curridabat ·{" "}
                  <span className="font-serif italic">usa Tulistica desde marzo</span>
                </p>
              </div>
            </div>
          </article>
        </div>
      </section>

      {/* Notifications strip */}
      <section className="border-y border-border bg-paper-deep py-14">
        <div className="container grid gap-6 md:grid-cols-[auto_1fr] md:items-center md:gap-10">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-paper">
            <Bell className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-serif text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              Avisos que ahorran plata, no que distraen.
            </h3>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              &laquo;Bajó el aceite Capullo &mdash; ₡ 1.890 en Pali Zapote.&raquo;
              &nbsp;·&nbsp; &laquo;Tu pareja agregó café molido.&raquo;
              &nbsp;·&nbsp; &laquo;Se te acaba la leche esta semana.&raquo;
            </p>
          </div>
        </div>
      </section>

      {/* Closing CTA — flat porcelain band */}
      <section className="py-20 md:py-28">
        <div className="container">
          <div className="rounded-[2rem] bg-paper-deep px-8 py-16 text-center ring-1 ring-border/60 md:px-16 md:py-20">
            <p className="font-serif italic text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Para el próximo sábado
            </p>
            <h2 className="mt-3 font-serif text-3xl font-medium leading-tight tracking-tight text-foreground sm:text-4xl md:text-5xl">
              Tu próxima lista te va a salir{" "}
              <span className="italic deco-underline">más barata</span>.
            </h2>
            <p className="mt-4 text-base text-muted-foreground sm:text-lg">
              Empezar toma 30 segundos. No pedimos tarjeta.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 gap-2 rounded-full px-7 text-base font-semibold"
              >
                <Link href={primaryHref}>
                  Empezar gratis
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 gap-2 rounded-full px-6 text-base"
              >
                <Link href="/map">
                  <MapPin className="h-4 w-4" />
                  Ver mapa de tiendas
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer — quiet full index */}
      <footer className="border-t border-border bg-background">
        <div className="container py-14 md:py-16">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {FOOTER_COLUMNS.map((column) => (
              <nav key={column.title} aria-label={column.title}>
                <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  {column.title}
                </p>
                <ul className="mt-4 space-y-2.5">
                  {column.links.map((link) =>
                    link.href.startsWith("#") ? (
                      <li key={link.label}>
                        <a
                          href={link.href}
                          className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                        >
                          {link.label}
                        </a>
                      </li>
                    ) : (
                      <li key={link.label}>
                        <Link
                          href={link.href}
                          className="text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                        >
                          {link.label}
                        </Link>
                      </li>
                    )
                  )}
                </ul>
              </nav>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-border pt-8 md:flex-row md:items-center">
            <BrandMark />
            <p className="text-xs text-muted-foreground">© Tulistica · 2026 · Costa Rica</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
