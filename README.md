# Grocery Waze

> Comparador colaborativo de precios de supermercados para Costa Rica.

Grocery Waze ayuda a las personas a pagar menos en cada compra del super:
compara precios entre Walmart, Auto Mercado, Más x Menos, Palí y más,
optimiza la ruta de compra (una tienda o varias) y construye una base de datos
comunitaria de precios verificada con geofence y detección de outliers.

## Características principales

- 187+ tiendas pre-cargadas en Costa Rica (San José, Heredia, Cartago,
  Alajuela, Liberia, Puntarenas, Limón y más)
- Búsqueda geoespacial con cálculo de distancias (Haversine)
- **Carrito Inteligente**: decide si conviene una sola tienda o un viaje
  dividido considerando combustible y valor del tiempo
- Reporte colaborativo de precios con validación por geofence y detección de
  outliers (Z-score)
- Sistema de confianza (0-100) y gamificación con puntos y rankings
- Escáner de códigos de barras (QuaggaJS) con búsqueda en Open Food Facts
- Listas compartidas en tiempo real (Socket.io)
- Conversión de recetas a listas usando LLM
- Despensa con predicción de reposición
- Alertas de bajada de precio

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 19, Vite 7, Tailwind v4, shadcn/ui, Wouter |
| API | tRPC v11, Express 4, Socket.io |
| Base de datos | MySQL 8 con Drizzle ORM |
| Autenticación | OAuth + sesiones JWT firmadas (jose) |
| Mapas | Google Maps Places API |
| LLM | Modelo proxy compatible con OpenAI Chat Completions |
| Tests | Vitest |

## Requisitos

- Node.js 20+
- pnpm 10+
- MySQL 8 (local o gestionado: PlanetScale, Aiven, etc.)
- Cuenta del proveedor OAuth elegido
- API key de Google Maps Platform (Places API) — directo o via proxy

## Setup local

```bash
# 1. Instalá las dependencias
pnpm install

# 2. Copiá las variables de entorno
cp .env.example .env

# 3. Editá .env con tus credenciales reales
#    (DATABASE_URL, JWT_SECRET, OAuth y Maps)

# 4. Aplicá las migraciones a la base de datos
pnpm db:push

# 5. (Opcional) Poblá la base con tiendas y productos de CR
pnpm tsx scripts/seed-costa-rica.ts

# 6. Levantá el servidor de desarrollo
pnpm dev
```

La app queda disponible en `http://localhost:3000`.

## Scripts

| Comando | Acción |
|---------|--------|
| `pnpm dev` | Servidor con HMR (Vite + Express) |
| `pnpm build` | Build de producción (cliente + servidor) |
| `pnpm start` | Corre el build de producción |
| `pnpm check` | Type-check completo (tsc --noEmit) |
| `pnpm test` | Suite de Vitest |
| `pnpm format` | Prettier sobre todo el repo |
| `pnpm db:push` | Genera y aplica migraciones con drizzle-kit |

## Estructura

```
.
├── client/              # SPA React
│   ├── src/
│   │   ├── pages/       # Vistas (Home, Dashboard, Stores, …)
│   │   ├── components/  # UI compartida
│   │   ├── lib/         # Cliente tRPC, helpers (currency, utils)
│   │   ├── hooks/       # Custom hooks
│   │   └── contexts/    # Theme provider, etc.
│   └── public/          # Assets estáticos (favicon, etc.)
├── server/              # API Express + tRPC
│   ├── _core/           # Infra (env, oauth, sdk, llm, map, vite)
│   ├── services/        # Smart cart, sockets, integraciones externas
│   ├── routers.ts       # Definición tRPC
│   └── db.ts            # Funciones de acceso a datos
├── shared/              # Tipos y constantes compartidas
├── drizzle/             # Schema, migraciones SQL
├── scripts/             # Seeds
└── todo.md              # Roadmap interno
```

## Despliegue en producción

1. **Variables obligatorias**: revisá `.env.example`. En `NODE_ENV=production`
   la app **rechaza arrancar** si falta `JWT_SECRET` (>= 32 chars) o
   `DATABASE_URL`.
2. **Base de datos**: corré `pnpm db:push` contra la base productiva.
3. **Build**:
   ```bash
   pnpm install --frozen-lockfile
   pnpm build
   pnpm start
   ```
4. **Reverse proxy** (Nginx, Caddy, Cloudflare): terminá TLS, redirigí 80→443
   y reenvían a `localhost:3000`.
5. **Headers**: la app ya envía `X-Content-Type-Options`, `X-Frame-Options`,
   `Referrer-Policy`, `Permissions-Policy` y `Strict-Transport-Security` en
   producción.
6. **Backups**: configurá snapshots diarios de MySQL y revisá el TTL de
   reportes de precio y crowdedness (definido en el schema).

### Hosting recomendado

- **App + sockets**: Railway, Fly.io o Render (soportan WebSockets persistentes).
- **DB**: PlanetScale, Aiven for MySQL o Amazon RDS.
- **Estáticos**: el build sirve `dist/public` desde el mismo proceso; si
  preferís CDN podés montar Cloudflare delante.

## Privacidad y cumplimiento

Costa Rica regula los datos personales bajo la Ley 8968 (PRODHAB). La política
de privacidad publicada en `/legal/privacy` cubre derechos ARCO, base legal,
retención, terceros y seguridad. Mantenelos al día si modificás integraciones
o flujos de datos.

## Contribuir

1. Hacé fork, creá una rama: `git checkout -b feat/mi-mejora`
2. Aseguráte de que `pnpm check` y `pnpm test` pasen.
3. Abrí un PR describiendo el cambio y el plan de prueba manual.

## Licencia

MIT — ver [LICENSE](./LICENSE).
