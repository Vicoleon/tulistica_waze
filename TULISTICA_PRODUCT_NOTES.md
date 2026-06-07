# Tulistica — Product Notes

Decisiones de producto que afectan diseño y arquitectura. Vive aparte del spec visual porque captura *intención*, no *implementación*.

---

## 1 · El "killer moment" — vive en mobile, no en web

**La app nativa de Android es imperativa y va YA. iOS queda para después.**

> **Decisión de plataforma (actualizada):** la web NO va a despegar sola. Nadie
> hace el mandado con la laptop metida en el carrito. La web es el panel de
> planificación y el comparador, pero la **adopción, la recurrencia y la captura
> de precios reales** viven en el celular en la tienda — y en Costa Rica eso
> significa **Android primero**. Sin app de Android, Tulistica se queda como una
> herramienta de "una vez de vez en cuando" en lugar del hábito semanal que
> queremos, y la red de precios colaborativa nunca alcanza masa crítica.
> Por eso Android pasa de "futuro" a **track prioritario en paralelo con la web**.
> iOS se construye después, reutilizando el mismo backend/tRPC. El flujo en
> tienda descrito abajo es la especificación para esa app de Android.

El uso primario de Tulistica no es planear la lista en la casa. Es **estar parada en el pasillo del super con el carrito**. Ahí la app tiene que sentirse como una extensión de la mano.

### Flujo en tienda (Android primero; iOS reutiliza el mismo flujo)

1. Usuario llega al super. Abre Tulistica.
2. Tulistica detecta la tienda automáticamente (geofence + bluetooth/beacons opcional) o le pregunta "¿Estás en PriceSmart Tres Ríos?"
3. La lista se reorganiza **por pasillo de esa tienda específica** (frutas y verduras → panadería → lácteos → granos → congelados → cajas). El orden lo aprende Tulistica con el tiempo.
4. Usuario camina, agarra el producto. Toca el ítem en la lista → check.
5. **Los ítems marcados bajan al final de la lista** (el "list will add at the end" del usuario). Lo que queda arriba es lo que todavía falta. Lectura mono-mano en un vistazo.
6. Si el precio en la góndola NO coincide con el que Tulistica esperaba (por ejemplo +15%), la app vibra suavemente y muestra "₡X esperado / ₡Y en góndola — ¿reportar?". Tap → cámara → barcode scan → confirmar nuevo precio. Sumas puntos.
7. Al llegar a la caja, Tulistica muestra total estimado vs. real (recibo escaneado o ingresado).

### Por qué no en web

- En web la persona está planeando o curioseando. En mobile-en-tienda está ejecutando.
- Barcode scan en web (laptop cam) no tiene sentido — la persona no carga la laptop al super.
- Touch targets, vibración, geofence, cámara, bluetooth: son nativos.
- El reorden por pasillo necesita conocimiento de layout de tienda — eso va creciendo desde la app móvil (cada checkmark con timestamp + ubicación reconstruye el mapa interno de pasillos).

### Implicaciones para web

- La web es **panel de control y planificación**: armar la lista, ver precios comparados, configurar despensa, ver ranking, configurar familia.
- Cuando llegamos al mobile, las APIs / schemas tienen que estar listos para:
  - `getActiveListForStore(userId, storeId)` → lista reordenada por pasillo
  - `recordItemPicked(itemId, storeId, timestamp, lat, lng)` → para aprender pasillos
  - `reportPriceMismatch(barcode, storeId, observedPrice)` → ya existe parcialmente vía Scanner
  - `getStoreLayout(storeId)` → ordering hint por categoría/aisle
- Diseñar el schema con estos endpoints en mente desde ya.

---

## 2 · Onboarding — perfilamiento del cliente (hacer pronto, en web)

**Para hacer ya, en web. Reusable en iOS después.**

### Por qué

Cada compradora costarricense no compra igual. La que tiene presupuesto ajustado va a MaxiPalí o Palí, le importa el precio sobre todo y compra a granel cuando puede. La que tiene más ingreso va a AutoMercado o PriceSmart, le importan marcas, frescura, variedad. Si Tulistica trata a las dos igual, le falla a ambas:

- A la primera la abrumamos mostrando tiendas premium que nunca va a usar.
- A la segunda le ofendemos sugiriendo Palí cuando nunca pondría un pie ahí.

**La solución no es preguntar "¿cuánto gana?"** — es preguntar 5-7 cosas concretas que revelan el perfil sin sentirse intrusivo.

### Las preguntas (draft v1)

**Mostrar en orden, una por pantalla, modal full-screen con barra de progreso.**

| # | Pregunta | Tipo | Opciones | Señal |
|---|----------|------|----------|-------|
| 1 | ¿Cuántas personas viven en tu casa? | Single | 1 · 2 · 3-4 · 5+ | Tamaño hogar → cantidades, frecuencia |
| 2 | ¿Cada cuánto hacés el mandado grande? | Single | Semanal · Quincenal · Mensual · Varias veces por semana | Cadencia |
| 3 | ¿Dónde solés hacer el mandado? Marcá todas las que aplican. | Multi | Walmart · MaxiPalí · Palí · Auto Mercado · PriceSmart · Más x Menos · Megasuper · Ferias del agricultor · Pulpería del barrio · Otra | **Señal #1 de tier de precio** |
| 4 | ¿Qué es lo más importante para vos al elegir tienda? Marcá hasta 3. | Multi (max 3) | Precio bajo · Productos frescos · Variedad y marcas · Cercanía a mi casa · Comprar al por mayor · Confianza en la tienda · Tener todo en un solo lugar | Prioridades → tier |
| 5 | ¿Qué clase de productos llenan tu carrito? Marcá las dos más fuertes. | Multi (max 2) | Frescos del día (frutas, verduras, carnes) · Granos y abarrotes (arroz, frijol, azúcar) · Procesados y congelados · Importados o gourmet · Marca blanca / genéricos · Productos para bebé / niños · Productos de limpieza y casa | Mix de canasta |
| 6 | ¿De qué zona sos? | Single (con autocomplete) | San José Centro · Escazú · Santa Ana · Heredia · Alajuela · Cartago · Curridabat · Tibás · Desamparados · Liberia · Otra | Ubicación (sin pedir GPS todavía) |
| 7 | ¿Qué te importa más cuando comprás? | Slider 0–100 | Izq: "Ahorrar lo más posible" · Der: "Que sea rápido y cerca" | Sesgo ahorro-vs-tiempo |

**7 preguntas. ~60 segundos en mobile.** Cada una con un "saltear" pequeño y discreto (no en el botón principal) por si la usuaria quiere irse al dashboard antes de terminar.

Después de la última: pantalla de cierre — "Listo, ya conocemos tu casa. Vamos a tu primera lista." → directo a `/lists` con su primera lista vacía y un quick-add prominente.

### El perfil derivado

De las 7 respuestas computamos:

```ts
type ShopperProfile = {
  householdSize: 1 | 2 | "3-4" | "5+"
  shoppingCadence: "weekly" | "biweekly" | "monthly" | "frequent"
  preferredChains: ChainId[]                  // de pregunta 3
  priceTier: "value" | "mid" | "premium"      // derivado de 3 + 4
  shoppingPriorities: Priority[]              // de pregunta 4
  basketMix: BasketCategory[]                 // de pregunta 5
  zone: string                                // de pregunta 6
  savingsVsTimeBias: number                   // 0-100 de pregunta 7
  onboardedAt: Date
}
```

### Cómo se usa downstream

| Surface | Cómo cambia con el perfil |
|---|---|
| `/dashboard` | Recetas sugeridas escalan al `householdSize`. La sección "tiendas cerca" prioriza `preferredChains`. |
| `/map` | Filtra a las cadenas preferidas por default; un toggle "ver todas" muestra el resto. |
| `/stores` | Reordena por tier: si sos `value`, los Palí/MaxiPalí salen primero; si sos `premium`, PriceSmart y AutoMercado. |
| `/optimize` (Smart Cart) | Si `savingsVsTimeBias < 40` → recomienda ruta partida agresiva. Si `> 60` → una sola tienda casi siempre. |
| `/recipes` | Filtra recetas por `basketMix` (ejemplo: si nunca compras "Importados/Gourmet", no te muestra recetas que requieren parmesano italiano específico). |
| Push notifications | Cadencia se basa en `shoppingCadence`. Si comprás semanal, sábado en la mañana mandamos "tu lista ya tiene precios actualizados". |

### Cuándo se dispara

- **Primera vez que el usuario entra al dashboard sin perfil** → redirect a `/onboarding`. Sin escape (excepto skip discreto).
- **Permanente desde `/profile`** → botón "Editar mi perfil de compra" que reabre el flujo con valores actuales.
- **Re-disparo opcional cada 6 meses** → "¿Sigue siendo así tu casa?" como modal one-time al entrar a `/dashboard`. Para capturar mudanzas, nacimiento de hijo, etc.

### Almacenamiento

Dos opciones:

**(a)** Reutilizar `users.preferences` JSON column (ya existe en schema). Pros: sin migración. Cons: queries más complejas si queremos filtrar usuarios por tier.

**(b)** Tabla nueva `shopper_profiles` con FK a `users.id`. Pros: queryable, versionable. Cons: migración.

**Recomendado (a) por ahora** — empezamos con JSON, migramos a tabla si las queries lo justifican.

### UX y diseño

- Una pregunta por pantalla, transición suave izquierda/derecha.
- Animación tipográfica suave en la pregunta (Fraunces italic en la palabra clave).
- Cada opción es un card grande (mobile-first, min 48px tap).
- Para multi-select, los seleccionados se hacen `bg-primary text-primary-foreground` con un checkmark.
- "Continuar" en peach/primary abajo, "saltear esta" en mono pequeño arriba a la derecha.
- Después de la última: animación de "armando tu casa…" con los iconos de las cosas que marcaste flotando.

### Privacidad

- Banner explícito al inicio: "Esto se queda en tu cuenta. Lo usamos para mostrarte tiendas y precios que tienen sentido para vos. No vendemos esto, no lo compartimos."
- Botón "ver mi perfil" en `/profile` que muestra las respuestas literales (no derivadas) — la usuaria sabe qué dijo.

---

## 3 · Orden sugerido de implementación

1. **Schema**: agregar tipo `ShopperProfile` en `shared/types/profile.ts` (no toca DB todavía).
2. **Backend**: nuevo router `trpc.profile.{ get, update }` que lee/escribe `users.preferences`.
3. **Frontend**: nueva ruta `/onboarding` con flujo de 7 preguntas + un componente `OnboardingFlow.tsx`.
4. **Gate**: en `DashboardLayout`, si el usuario tiene `loading=false` y `user.preferences.onboardedAt == null`, redirect a `/onboarding`.
5. **Profile page**: agregar sección "Mi perfil de compra" mostrando las respuestas, con un botón "Editar".
6. **Downstream consumers** (uno a la vez, no de golpe): empezar con `/map` (filtro por preferredChains) y `/optimize` (savings vs time bias). El resto puede esperar.

Cada paso es un PR/feature independiente. Tiempo estimado total: 2-3 sesiones de trabajo.

---

## 4 · El perfil como motor de revenue

> **El revenue model de Tulistica es bid-based**: cadenas y marcas pagan por aparecer en posiciones de búsqueda, alertas de precio, recetas patrocinadas, y banners de promoción. **Sin perfil de usuario, los bids son a ciegas**. Con perfil, las marcas pueden segmentar — y por segmentación pagan más.
>
> Esta sección mapea cada campo del onboarding a una palanca de monetización concreta, y propone el orden en que las palancas se vuelven utilizables.

### 4.1 · Mapa profile → revenue

| Campo del perfil | Para quién es valioso | Cómo cobra Tulistica |
|---|---|---|
| `priceTier: value` | MaxiPalí, Palí, Walmart, marcas blancas | CPM más bajo pero volumen alto (60-70% de la base). Ideal para promo de productos básicos. |
| `priceTier: premium` | Auto Mercado, PriceSmart, marcas importadas, gourmet, bio | **El segmento más rentable.** CPM 3-5× del value tier porque la canasta vale 2-3×. |
| `priceTier: mid` | Más x Menos, Megasuper, marcas reconocidas (Dos Pinos, Tío Pelón) | El "sweet spot" de la mayoría de las marcas grandes. |
| `preferredChains` | Cualquier cadena que NO está en la lista | Oportunidad de **bid agresivo de conquista** — "esta cliente nunca te ha elegido, pagamos premium por exponerla". |
| `shoppingPriorities: promociones` | Cualquier marca con campaña activa | El segmento de "cazadoras de ofertas" — alta engagement con descuentos. Vale más en CTR. |
| `shoppingPriorities: frescos` | Carniceros, pescaderías, ferias del agricultor, productos lácteos | Targeting de productos perecederos. |
| `basketMix: saludable` | Marcas orgánicas / bio / sin gluten | Nicho premium con muy poco competidor — bids altos. |
| `basketMix: snacks` | Coca-Cola, Pepsi, Pozuelo, snacks importados | Volumen masivo. |
| `basketMix: limpieza` | P&G, Unilever, marcas blancas de limpieza | Categoría con campañas casi siempre activas. |
| `householdSize` | Marcas que escalan presentación (1L vs 3L, presentación familiar) | Promoción del SKU correcto, no del genérico. |
| `shoppingCadence` | Productos con vida útil (fresco vs no-fresco) | Tu cliente compra semanal → push receta del sábado. Mensual → mando una vez. |
| `savingsVsTimeBias > 60` | Marcas premium dispuestas a pagar por conveniencia | Estos clientes ignoran cupones agresivos pero responden a "está cerca + tiene todo". |

### 4.2 · Las 4 superficies de monetización

#### A · **Búsqueda patrocinada** (`/products`)
Cuando la cliente busca "aceite", entre los resultados orgánicos (más barato/cercano) **inyectamos 1-2 slots "Patrocinado"** ranqueados por:
- `bid_amount × match_score(usuario, producto)`
- `match_score` usa `priceTier`, `preferredChains`, `basketMix`

**Por qué funciona:** una marca premium nunca paga por mostrarse al value tier (ROI cero). Pero pagaría triple por mostrarse al premium tier que todavía no la elige. Sin perfil, no podemos hacer esto.

#### B · **Alertas patrocinadas** (`/alerts` + push)
Hoy las alertas son user-driven ("avísame si baja el café"). Agregamos **alertas push iniciadas por marca**:
- Auto Mercado paga ₡500 por usuario expuesto: "Auto Mercado tiene tu marca de queso favorita -25% esta semana"
- Solo se envía a usuarios con `basketMix.includes('frescos')` + `priceTier in (mid, premium)` + `shoppingCadence in (weekly, biweekly)`
- Métrica que vendemos: **CTR + conversiones físicas** (cuántos terminaron yendo a esa tienda esta semana, medido por reportes de precio + escaneos).

#### C · **Recetas patrocinadas** (`/recipes`)
Las recetas son contenido evergreen con engagement alto. Marcas patrocinan recetas que requieren su producto.
- "Olla de carne con Salsa Lizano" → Lizano paga por impresión + clic en "agregar Lizano a mi lista".
- Filtros: `basketMix`, `householdSize` (escala porciones), `savingsVsTimeBias` (recetas rápidas vs elaboradas).
- Modelo: **CPC** (clic en "agregar a mi lista") más alto que CPM tradicional.

#### D · **Insights agregados** (B2B, no consumer)
Los datos de reportes de precio + perfiles agregados se venden como **dashboard de inteligencia** a marcas y cadenas:
- "67% de tus clientes mid-tier en San José también compraron en Auto Mercado este mes."
- "El precio de Aceite Capullo en MaxiPalí subió 8% mientras en Walmart bajó 3% — tus ventas en MaxiPalí cayeron 12%."
- "Tu marca tiene 23% share en el value tier vs 4% en el premium tier — gap de ₡14M en revenue potencial."
- **Modelo: suscripción mensual** (₡500K-₡2M dependiendo del nivel). Esto es el revenue más alto por cliente.

### 4.3 · Analytics — eventos a loggear desde ya

**Sin datos, no hay producto que vender a las marcas.** Hay que empezar a recolectar AHORA, aunque tarden 3-6 meses en ser utilizables.

Crear una tabla `analytics_events` con columnas: `id, userId, sessionId, eventName, properties (json), createdAt`. Loggear desde el server tRPC middleware.

**Eventos mínimos viables (Tier 1):**

| Evento | Properties | Para qué |
|---|---|---|
| `onboarding_completed` | priceTier, householdSize, cadence, zoneSet | Distribución de la base por tier |
| `onboarding_skipped` | stepReached | Funnel de abandono |
| `product_search` | query, resultsCount, tier | Demanda por categoría/término |
| `product_clicked` | productId, position, isSponsored, tier | CTR base para futuros bids |
| `list_item_added` | productId, source (search/recipe/scan/manual), tier | Atribución de inserción |
| `list_optimized` | listId, savedAmount, strategy (single/split/closest), tier | Conversión del Smart Cart |
| `price_reported` | storeId, productId, deltaFromExpected, tier | Calidad de la red |
| `recipe_viewed` | recipeId, isSponsored, tier | Engagement con recetas |
| `recipe_added_to_list` | recipeId, isSponsored, productsAdded, tier | Conversión recetas → carrito |
| `alert_created` | productId, threshold, tier | Demanda de tracking |
| `alert_triggered` | alertId, productId, store, tier | Eficacia push |
| `store_viewed` | storeId, chainId, source (map/list/optimize), tier | Demand por tienda |
| `scanner_used` | barcode, foundInDb, priceMatch, tier | Adopción del feature crítico |
| `notification_clicked` | type, tier | Eficacia push |

Cada evento incluye `tier` automáticamente (lo derivamos del user al loggear). Esto evita JOINs caros después.

**Para los reportes ejecutivos (Tier 2):**

| Cohort | Métrica |
|---|---|
| Por `priceTier` | DAU, retention 7-day, lists creadas, items por lista, ahorro promedio |
| Por `shoppingCadence` | Push CTR según día/hora |
| Por `basketMix` | Categorías más buscadas, top productos, gap vs disponibilidad |
| Por `preferredChains` | Migración entre cadenas (quién cambió y cuándo) |

### 4.4 · Roadmap concreto de monetización

**Fase 1 — Recolección (semanas 1-4, ahora):**
- [ ] Crear tabla `analytics_events`
- [ ] Middleware tRPC que captura los eventos de §4.3
- [ ] Dashboard admin interno `/admin/analytics` con conteos básicos por tier
- [ ] Wire downstream: `/products` ordena por `preferredChains` del usuario primero

**Fase 2 — Targeting básico (semanas 5-10):**
- [ ] Modelo de datos para `sponsored_placements` (campaign, targeting, bid, dates)
- [ ] Hardcoded campaigns de prueba (no self-serve aún) — 2-3 marcas pilotaje
- [ ] Slots "Patrocinado" en `/products` con label visible
- [ ] Alertas push patrocinadas con segmentación por `priceTier`

**Fase 3 — Bid auction (mes 3-6, depende de fase 2):**
- [ ] Self-serve brand portal `/brand` (login separado)
- [ ] Bid engine simple (max CPM por tier, primer-precio o segundo-precio)
- [ ] Dashboard de performance para la marca (impresiones, CTR, conversiones)
- [ ] Facturación mensual

**Fase 4 — Insights B2B (mes 6+, depende de masa crítica):**
- [ ] Producto B2B de suscripción (`tulistica.com/insights`)
- [ ] Reportes mensuales aggregados por categoría/cadena/tier
- [ ] Alertas para marcas ("tu market share cayó X% esta semana")

**Prioridad inmediata:** sólo Fase 1. **Sin analítica no hay producto que vender en Fase 2+.** Cada semana que tardemos en empezar a loggear es una semana de datos perdidos.

### 4.5 · Reglas de oro para no romper la confianza

- **Lo patrocinado se marca como tal**, siempre. Etiqueta visible "Patrocinado" en cualquier slot pago.
- **El comparador orgánico nunca se mancha** — el resultado "más barato" siempre es el más barato real. Si lo manipuláramos, la propuesta de valor se cae.
- **Los datos individuales no se venden**, solo agregados. La cliente sabe que pagamos con su perfil pero no con su identidad.
- **Marcas no pueden ver listas individuales** — solo dashboards agregados.
- **El perfil es editable y borrable** desde `/profile`.

---

## 5 · Notas que NO son para hacer ahora

- **iOS app** — DESPUÉS de Android. (Android ya no está en esta lista: es track prioritario, ver §1.) Cuando llegue iOS, reutiliza el backend/tRPC y el flujo en tienda ya especificado en §1; no se reinventa nada.
- **Geofence / beacons en tienda** — parte de la app nativa de Android (no de la web). Geofence en el primer release de Android; beacons/bluetooth, opcional y más adelante.
- **Recetas escaladas por tamaño de hogar** — depende del perfil. Después de onboarding.
- **Self-serve brand portal** — solo cuando tengamos 5-10 campañas hardcoded y validemos que el modelo funciona.

### Movido a track prioritario (ya NO es "para después")

- **App nativa de Android** — imperativa, en paralelo con la web. Es el vehículo de adopción/recurrencia y la fuente principal de captura de precios. Ver §1.
- **Aprendizaje del orden de pasillos** — se empieza a recolectar en cuanto Android esté afuera (cada checkmark con timestamp + ubicación reconstruye el mapa de pasillos). Hasta entonces, seedear con orden estándar (frutas → panadería → lácteos…) por cadena.
