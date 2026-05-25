# Tulistica — Design & UX Spec (v1, 2026-05-24)

> **Mandatory read** for every agent working on this redesign. Stick to it. Do not invent new tokens, new colors, new type, or new IA. If something is missing here, ask in your summary — do not improvise.

---

## 0 · Brand

- **Name:** Tulistica (note the lowercase brand mark `tulistica`, capital T only when used as a proper noun in body copy)
- **Domain:** tulistica.com
- **Old name to remove everywhere:** "Grocery Waze" → "Tulistica"
- **One-liner:** *Donde vive la lista del super de tu casa.*
- **Subline:** *Hace la lista de la semana de toda Costa Rica más barata, sin esfuerzo.*

---

## 1 · Concept (CRITICAL — read carefully)

Tulistica is **not** an occasional savings app. It is **not** "use it once in a while". It is **not** "calm because we don't bother you".

Tulistica **is**:
- **The home of the weekly grocery list** for every Costa Rican family. Always-on. Lives in the background all week, comes alive on shopping day.
- **The first thing you open** when you think *"voy al super este sábado"*.
- **A habit**, not a tool. You add a missing item on Tuesday from the kitchen. On Saturday morning, your list is already priced and routed.
- **Welcoming of useful notifications**: price drops on items you care about, "se te acaba el aceite", "tu lista cambió", "alguien de la familia agregó X". Notifications are wanted because they save money.
- **A community of millions of weekly lists** — but the user doesn't think about that. They just experience cheaper prices because the system aggregates demand and forces stores to compete. **This second-order effect is implicit and never mentioned in user-facing copy.**

### Copy voice
- Warm, familiar, Costa Rican Spanish (`vos` is OK; mostly use `usted` / `tu` neutral)
- Confident, never apologetic. Tulistica is *useful*, not *gentle*.
- Use cooking/home vocabulary (*lista*, *despensa*, *recetario*, *barrio*, *mandado*, *canasta*, *vuelto*).
- Avoid jargon: ❌ algorithm, dashboard, terminal, optimizer, micro-services, KPI.
- Avoid passive language: ❌ "puede revisar cuando quiera". ✅ "su lista lo espera".

### Anti-patterns from earlier mockup wording (replace if you see them)
- ❌ "Sin notificaciones" — Tulistica notifies, smartly.
- ❌ "Sin presión" — replace with concrete benefit ("sale más barato").
- ❌ "Una libreta calmada" / "una libreta para hogares con tiempo" — Tulistica is for *every* family, every week.
- ❌ "Para hacer compras de vez en cuando" — replace with "para la lista del super, todas las semanas".

### Example before/after
| Before (mockup) | After (spec) |
|---|---|
| Una libreta de cocina que también sabe de precios | Donde vive la lista del super de tu casa |
| Sin estridencias, sin sorpresas | Sin sorpresas en la caja, sin volver a olvidarse del cilantro |
| Para la casa de todos los días | Para la canasta de todas las semanas |
| Sin spam | Te avisamos cuando se te acaba algo o cuando baja un precio |

---

## 2 · Visual system — "Cocina + Pastel" (mock-ups 05 + 07 combined)

### 2.1 Color tokens (already wired in `client/src/index.css`)

| Token | Light value | Use |
|---|---|---|
| `--background` | warm cream `oklch(0.97 0.018 78)` | page background |
| `--card` | pure white | cards, surfaces |
| `--paper-deep` | deeper cream | alt section background |
| `--foreground` | warm dark brown | primary text |
| `--muted-foreground` | warm taupe | secondary text |
| `--primary` | terracotta `oklch(0.62 0.14 38)` | **primary CTA, links, accent** |
| `--primary-foreground` | white | CTA text |
| `--secondary` (sage) | sage green `oklch(0.66 0.09 130)` | secondary chips, success states |
| `--accent` (peach) | warm peach `oklch(0.78 0.13 52)` | tags, soft highlights, friendly badges |
| `--butter` | butter yellow `oklch(0.84 0.13 84)` | featured tags, savings highlights |
| `--rose` | dusty rose `oklch(0.82 0.07 22)` | gentle alerts, like-states |
| `--sky` | dusty sky | informational tags |
| `--destructive` | warm red | errors, removals |
| `--border` | warm light `oklch(0.9 0.025 78)` | dividers |
| `--ring` | terracotta | focus rings |

CSS variables are already extended in `index.css`. **Do not redefine.** Use Tailwind utility classes (`bg-primary`, `text-primary-foreground`, `bg-secondary`, `bg-accent`, etc.) and our new helpers below.

### 2.2 Custom utility helpers added in `index.css`

Use these directly (no `var(--...)` wrappers):

- `bg-paper-deep` / `text-paper-deep` — cream-deep
- `bg-butter` / `text-butter-foreground`
- `bg-rose-soft` (very light rose tint)
- `bg-sage-soft` (very light sage tint)
- `bg-peach-soft` (very light peach tint)
- `font-serif` — Fraunces, used for headings, hero numbers, friendly labels
- `font-sans` — Nunito (warm, rounded body)
- `font-mono` — JetBrains Mono, used only for prices and numeric data

### 2.3 Typography

- **Headings:** `font-serif font-semibold tracking-tight` (Fraunces 600). Hero H1 may use `font-medium` (500) for a softer feel.
- **Italic accent words:** Inside headings, use `font-serif italic text-primary` for the keyword that carries the meaning (e.g. *barato*, *cocina*, *familia*).
- **Body:** `font-sans` (Nunito), 16px minimum on mobile, line-height 1.6.
- **Prices / numeric data:** `font-mono font-semibold` — never use Fraunces for raw numbers like `₡ 1.290` (numbers in serif read weirdly tabular).
- **Eyebrows / small caps:** `text-xs uppercase tracking-[0.16em] text-muted-foreground` or with `font-serif italic` for a warmer variant.

### 2.4 Radii & shadows

- **Cards:** `rounded-3xl` (24px) for primary cards. `rounded-2xl` (16px) for compact tiles.
- **Buttons:** `rounded-full` for all primary/secondary buttons. Use shadcn defaults for icon/ghost.
- **Inputs:** `rounded-xl` (12px), generous padding (`py-3 px-4` minimum).
- **Shadows:** prefer `shadow-sm` for resting, `shadow-lg` for hovered/lifted cards. Custom helper `shadow-paper` available for hero cards.

### 2.5 Hover behavior

- ✅ `transition-colors duration-200` + color/border change
- ✅ `hover:-translate-y-0.5` for lift on cards (NO scale)
- ❌ Never `hover:scale-*` — causes layout shift (per global `coding-style.md` rule)

### 2.6 Iconography

- **Use Lucide icons exclusively** (already in project via `lucide-react`).
- Standard size `w-5 h-5` for inline, `w-6 h-6` for feature icons.
- Stroke width `1.6` or default `2`. Avoid `stroke-3`.
- **No emojis** as UI icons. Body copy CAN use sparingly (✿ etc.) only for delight moments in marketing surfaces — never in dashboard.
- Color icons by intent:
  - `text-primary` for primary actions
  - `text-secondary-foreground` for sage/success
  - `text-accent-foreground` for peach/friendly
  - `text-muted-foreground` for neutral

---

## 3 · Information architecture (logged-in app)

### 3.1 Sidebar groups (replace the placeholder "Page 1 / Page 2" in `DashboardLayout.tsx`)

```
Tu semana
  · Mi lista          → /lists  (lands on active weekly list)
  · Recetario         → /recipes
  · Despensa          → /pantry

Saber el precio
  · Mapa de tiendas   → /map
  · Tiendas           → /stores
  · Buscar productos  → /products
  · Alertas de precio → /alerts
  · Plan de compra    → /optimize

Comunidad
  · Escanear          → /scanner
  · Ranking           → /leaderboard
  · Mi perfil         → /profile
```

Total: 11 items in 3 groups. Each group has a small uppercase eyebrow label in sidebar (`text-xs tracking-[0.12em] text-muted-foreground/70 px-3 mb-1`).

### 3.2 Dashboard landing (`/dashboard`)

The post-login landing must surface **the active weekly list**, not a generic dashboard. Replace whatever is currently there with:

1. **Greeting** (top): `font-serif text-3xl` "Buenos días, {firstName}." + subline "Tu lista de esta semana tiene N productos."
2. **Active list card** (primary, big): top 5 items of current list, "ver lista completa" link, total estimated price, "ahorras ₡X vs. la tienda más cara" pill.
3. **Quick add bar** (sticky-ish, big): a `Quick add` input — "agrega algo a tu lista..." with a "+" button. Submit → adds to active list.
4. **Three smaller tiles**: "Plan de compra esta semana" (Optimize CTA), "Despensa: 3 cosas se acaban pronto" (Pantry shortcut), "Tiendas cerca de hoy" (Map shortcut).
5. **Side rail (right, desktop only)**: ranking position, alertas recientes, recetas sugeridas.

If the underlying queries don't exist, the agent should still build the JSX with mock-shaped placeholders that visibly match the data shape — the user said do not touch functionality. Use `// TODO: wire to <hookName>` comments where data wiring is missing.

### 3.3 Top bar inside dashboard layout

Keep the existing sidebar trigger + user dropdown, but **add a global "Buscar producto..." search** in the middle of the top bar (visible md+, hidden behind icon on mobile). On submit → navigates to `/products?q=…`.

---

## 4 · Page-by-page redesign scope

For each page, agents must:
1. Replace marketing copy with concept-aligned copy (see §1).
2. Apply the visual system (§2).
3. Apply UX micro-fixes (§5).
4. Keep all existing hooks, queries, and data wiring **untouched**. Edit JSX, classNames, and copy strings only.

### Pages & files

| File | Role | Key redesign notes |
|---|---|---|
| `Home.tsx` | Logged-out marketing | Hero = "Donde vive la lista del super de tu casa" + live list illustration + clear primary CTA "Crear mi lista — gratis". Pull pattern from mockup 05+07. |
| `DashboardLayout.tsx` | App shell | Sidebar IA (§3.1) + top bar search (§3.3). Brand mark says "tulistica" with terracotta dot. |
| `Dashboard.tsx` | Post-login home | §3.2 layout exactly. |
| `ShoppingLists.tsx` | All lists | Single active list pinned at top with full preview; other lists as compact rows below; "Nueva lista" CTA prominent. |
| `ListDetail.tsx` | One list | The heart of the app. Big list view, inline edit, quick add at top, totals + cheapest-store badge at top. Modal flows (add item, share, etc.) get UX micro-fixes from §5. |
| `Optimize.tsx` | Smart Cart | Rename header to "Plan de compra de esta semana". Show 3 strategy cards (single store / split route / closest) with clear winner highlighted. |
| `MapView.tsx` | Store map | Soft, warm UI around the actual map. Sticky filter chips. Selected-store side panel uses card styling. |
| `Stores.tsx` | Store browser | Grid of store cards, warm tint, "tiendas cerca de vos" eyebrow. |
| `Products.tsx` | Search products | Big search input at top (this is the entry point from top bar search). Result cards. |
| `PriceAlerts.tsx` | Manage alerts | List of monitored items + "agregar alerta" modal. |
| `Pantry.tsx` | Pantry | Visual "shelves" (mockup 05 vibe) showing levels; alert chips for low items. |
| `Recipes.tsx` | Recipes | Paste URL field big at top; converted recipes below as recipe-cards. |
| `Scanner.tsx` | Barcode scanner | Focused scanner UI, big "what we found" reveal card. |
| `Leaderboard.tsx` | Community ranking | Polaroid-ish ranked cards from mockup 09 lite. Top 3 highlighted. |
| `Profile.tsx` | User profile | Warm settings page; stats cards on top, prefs below. |
| `NotFound.tsx` | 404 | Soft "Esta página se quedó sin recibo" with link back. |

`ComponentShowcase.tsx` is internal — leave alone unless trivial token replacements are needed.

---

## 5 · UX micro-fixes (apply EVERYWHERE)

### 5.1 Modals (Dialog, AlertDialog, Sheet, Drawer)

- **Outside click closes**: Radix Dialog already supports this. Do NOT add `onPointerDownOutside={(e) => e.preventDefault()}` anywhere. If you find such code in an existing file, remove it (unless there's an explicit unsaved-data confirmation — in that case keep but document).
- **ESC closes**: same — already supported.
- **Close button (X) is visible**: keep the default `showCloseButton` enabled on `DialogContent`.
- **`DialogTitle` and `DialogDescription`** must always be present (a11y). Use `sr-only` if visually hidden.

### 5.2 Save / Submit flows

After a successful mutation:
- If the save creates a new entity → `navigate` to the detail page of that entity.
- If the save edits an existing entity inside a modal → close the modal AND show a sonner toast (`toast.success("Guardado")`).
- If the save edits inline on the same page → just show the toast.
- **Never** leave the user stuck on a "Saved!" empty state.

Use `useLocation` from `wouter` and `navigate(path)` for routing. Use the existing `toast` from `sonner`.

### 5.3 Buttons

- Every clickable element: `cursor-pointer` (already a global rule in `index.css`).
- Loading buttons: disable + show spinner during async ops.
- Destructive actions: use `variant="destructive"` shadcn button + an AlertDialog confirmation.
- Primary actions: always `bg-primary text-primary-foreground` (terracotta).
- Secondary actions: `variant="outline"` with neutral border.

### 5.4 Empty states

- Always provide a clear CTA in empty states.
- Use a friendly illustration placeholder (an inline SVG of a basket/leaf is fine).
- Voice example: "Todavía no tenés lista. Crear una toma 10 segundos." + big "Nueva lista" button.

### 5.5 Mobile

- Min tap target 44px (use `min-h-11` or `h-11` for buttons).
- Bottom-fixed primary CTA on long pages (ListDetail especially): a sticky `<div className="sticky bottom-0">` with the most important action.
- No horizontal scroll except for explicitly scrollable chip rows.

### 5.6 Forms

- Labels above inputs (not floating).
- Errors below inputs, in `text-destructive`.
- Required indicator: small `*` in `text-destructive` after the label.

### 5.7 Tables / list rows

- Don't use raw HTML tables for "data lists" (e.g. price comparisons). Use card-styled rows for warmth.
- Dotted bottom borders between rows in list-style cards (`border-b border-dashed border-border`).

### 5.8 Focus states

- `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2` on all interactive elements. shadcn defaults already cover this — don't override away from it.

### 5.9 Reduced motion

- All transitions should respect `prefers-reduced-motion`. Tailwind's `motion-reduce:` variant or omit transitions on critical elements.

---

## 6 · Hard rules (do not break)

1. **Do NOT edit any business logic, hooks, mutations, queries, store shapes, API URLs, or auth.** Edit only JSX, classNames, copy strings, and routing-after-save behavior (§5.2).
2. **Do NOT remove pages or routes.** IA reorganizes the *sidebar*, not the routes.
3. **Do NOT install new dependencies.** Everything you need is already installed (lucide-react, sonner, shadcn primitives, wouter, react-hook-form, zod).
4. **Do NOT touch `client/src/_core/`, `server/`, `shared/`, `drizzle/`, or `scripts/`.** Read-only.
5. **Do NOT rename existing components, hooks, or types.** That's a scope creep.
6. **Always preserve existing prop signatures of shadcn components** — they're already wired throughout.
7. **No emojis as icons.** Use Lucide. Body-copy emojis allowed sparingly (only `✿` `•` `—`) in marketing surfaces.
8. **No dark mode work in this pass.** Keep dark classes if they exist; do not invest in tuning them.
9. **No new fonts beyond Fraunces + Nunito + JetBrains Mono** (already added to `index.html`).
10. **Mobile-first.** If a layout decision conflicts, the small-screen version wins.

---

## 7 · How to verify before returning

Before reporting your work done:

1. `pnpm tsc --noEmit` from the worktree root — no new TS errors introduced.
2. Every file you touched still compiles.
3. Every modal you touched: outside-click closes it, ESC closes it.
4. Every save button you touched either navigates or toasts (never leaves you stranded).
5. The brand says **Tulistica** everywhere — no "Grocery Waze" lingering in your scope.
6. Empty states, error states, and loading states are at least visually styled (not left as raw text).

Return a short summary listing the files changed and the most consequential decisions, including any "I had to invent something the spec didn't cover" notes for the integrator (me) to review.
