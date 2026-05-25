# Brand-Cookie Deprecation — Design Spec

**Status:** Approved, ready for implementation planning
**Date:** 2026-05-25
**Scope:** Subsystem A of Phase 3. Removes the legacy brand-cookie auth surface and routes brand access through the `brand_members` table created in the prior auth/role-model spec. Vendor onboarding (Subsystem B) and vendor admin UI (Subsystem C) are explicit follow-on specs.

**Prior spec:** [2026-05-25-auth-and-role-model-design.md](2026-05-25-auth-and-role-model-design.md)

---

## 1. Problem

Phase 1+2 introduced `brand_members`, but the brand portal still runs on a parallel auth surface: a separate `brand_session_id` cookie, scrypt-hashed brand passwords, and an entire brandAuth router (signin, signup, verify-email, forgot-password, reset-password) that duplicates the consumer auth flow. A real human cannot be both a brand owner and a consumer with one identity. Two passwords to remember. Two reset flows to maintain.

This spec removes the legacy brand cookie and routes brand access through `brand_members` so that a single user identity grants access to one or more brands.

## 2. Goals / Non-goals

**Goals**
- One authentication surface: `/sign-in` (consumer auth). Brand access is granted by `brand_members` rows.
- `brandProcedure` and `brandVerifiedProcedure` read the active brand from `brand_members` × an active-brand cookie, not from a brand JWT.
- Existing brand-only accounts migrate cleanly: each gets a corresponding `users` row + `brand_members` owner row. They use the standard `/forgot-password` flow to set a new password.
- A multi-brand user can switch active brand via a header dropdown.
- `/brand/login`, `/brand/forgot-password`, `/brand/reset-password`, `/brand/verify-email` redirect to their user-side equivalents.
- `/brand/register` becomes a brand-creation form available only to signed-in users (no more account creation in this step).

**Non-goals (deferred)**
- Vendor onboarding (apply to become a vendor → super-admin approval) — Subsystem B spec.
- Vendor admin UI (manage stores, invite staff, analytics) — Subsystem C spec.
- Dropping the dead `brands.passwordHash` / `passwordSalt` / `emailVerified` columns. Stays in schema as dead-but-harmless storage until a separate cleanup migration ships.
- Refactoring the brand-portal client pages (Dashboard, Campaigns, Billing, Settings) — those keep working unchanged because they call `trpc.brandAuth.me`, which still exists.

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Migration shape | Single non-destructive SQL: INSERT rows into `users` and `brand_members` for brands missing them | Safe to re-run; doesn't touch existing rows. |
| Existing brand passwords | Force password reset for all migrated accounts | Clean break from scrypt. Migrated users sign in with the standard bcrypt-hashed user password after running `/forgot-password`. Avoids carrying two password-verification algorithms forever. |
| Brand switcher UI | Header dropdown ("Acting as: X") with session-scoped cookie | Familiar pattern from Slack/GitHub. Works with any tRPC procedure via cookie. |
| Brand-portal pages | Stay as-is; server returns new `brandAuth.me` shape | Minimizes UI surface area. The pages already call `brandAuth.me`. |
| Coexistence | None — single clean break | Brand cookie code is contained enough that maintaining both paths is more expensive than the migration. |

## 4. Schema changes

**None.** Everything needed already exists from the prior spec: `brand_members`, `brands.kind`, `users.emailVerified`, `user_tokens`.

A SQL migration `drizzle/0010_brand_to_user_migration.sql` runs INSERTs only — no ALTER TABLEs.

## 5. Data migration

### 5.1 Migration SQL

```sql
-- drizzle/0010_brand_to_user_migration.sql
-- For each brand without a corresponding user row, create one. Then
-- ensure every brand has at least one owner-level brand_members row.
-- Both INSERTs are idempotent (NOT IN / NOT EXISTS guards).

INSERT INTO users (openId, name, email, loginMethod, role, emailVerified, emailVerifiedAt)
SELECT
  CONCAT('legacy-brand:', LOWER(b.email)),
  COALESCE(b.contactName, b.companyName),
  LOWER(b.email),
  'brand-migration',
  'consumer',
  b.emailVerified,
  CASE WHEN b.emailVerified = 1 THEN NOW() ELSE NULL END
FROM brands b
WHERE LOWER(b.email) NOT IN (
  SELECT LOWER(email) FROM users WHERE email IS NOT NULL
);

INSERT INTO brand_members (brandId, userId, membershipRole, acceptedAt)
SELECT b.id, u.id, 'owner', NOW()
FROM brands b
JOIN users u ON LOWER(u.email) = LOWER(b.email)
WHERE NOT EXISTS (
  SELECT 1 FROM brand_members bm
  WHERE bm.brandId = b.id AND bm.userId = u.id
);
```

After this migration:
- Every brand row has at least one owner-level member.
- Migrated brand-only accounts now have a `users` row with `passwordHash = NULL` (cannot sign in until they reset).
- `loginMethod = 'brand-migration'` is a marker the operator script in §5.3 uses to find these users.

### 5.2 Pre-flight read-only check

Operator script `scripts/check-brand-migration-readiness.sql`:

```sql
-- Count brands without a corresponding user (will be created)
SELECT COUNT(*) AS brands_to_migrate
FROM brands b
WHERE LOWER(b.email) NOT IN (SELECT LOWER(email) FROM users WHERE email IS NOT NULL);

-- Count brands without any membership row (will get one)
SELECT COUNT(*) AS brands_missing_membership
FROM brands b
WHERE NOT EXISTS (SELECT 1 FROM brand_members bm WHERE bm.brandId = b.id);

-- Count brand emails that collide with an existing user (will share the user)
SELECT COUNT(*) AS shared_user_collisions
FROM brands b
WHERE LOWER(b.email) IN (SELECT LOWER(email) FROM users WHERE email IS NOT NULL);
```

Not a hard gate — just info for the operator to know what the migration will touch.

### 5.3 Post-migration operator script

`scripts/send-brand-password-reset-emails.ts` — one-off Node script run after deploy:

```ts
// Pseudocode
const migrated = await db.select().from(users).where(
  and(eq(users.loginMethod, 'brand-migration'), isNull(users.passwordHash))
);
for (const u of migrated) {
  const token = generateUserToken();
  await db.insert(userTokens).values({
    userId: u.id,
    token,
    type: 'password_reset',
    expiresAt: userTokenExpiry('password_reset'),
  });
  const url = buildUserActionUrl(ENV.appBaseUrl, 'reset-password', token);
  await sendUserEmail({
    to: u.email,
    subject: 'Set your Tulistica password',
    body: `Your brand account has been migrated. Set your password:\n${url}`,
  });
}
```

Run once per environment via `pnpm tsx scripts/send-brand-password-reset-emails.ts`. Not invoked automatically — operator chooses when.

## 6. Server changes

### 6.1 `server/_core/context.ts`

Replace the brand-cookie branch with membership resolution:

```ts
// Removed:
//   const claims = await getBrandSessionFromRequest(opts.req);
//   if (claims) brand = await db.getBrandById(claims.brandId) ?? null;

// Added:
if (user) {
  const memberships = await db.getAllMembershipsForUser(user.id);
  if (memberships.length > 0) {
    const activeBrandId = getActiveBrandIdFromRequest(opts.req);
    const active = memberships.find(m => m.brand.id === activeBrandId) ?? memberships[0];
    brand = active.brand;
  }
}
```

### 6.2 `server/_core/cookies.ts`

Add three helpers:

```ts
export function getActiveBrandIdFromRequest(req: Request): number | null;
export function setActiveBrandCookie(res: Response, req: Request, brandId: number): void;
export function clearActiveBrandCookie(res: Response, req: Request): void;
```

The cookie is `httpOnly`, `sameSite='lax'`, `maxAge` = 30 days, follows the existing `getSessionCookieOptions(req)` pattern for secure-flag handling.

### 6.3 `server/_core/trpc.ts`

`brandProcedure` is unchanged structurally — it still checks `ctx.brand`. The middleware doesn't care how `ctx.brand` got populated.

`brandVerifiedProcedure` gains an additional check on `ctx.user.emailVerified`:

```ts
export const brandVerifiedProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: UNAUTHED_ERR_MSG });
    if (!ctx.user.emailVerified) throw new TRPCError({ code: 'FORBIDDEN', message: EMAIL_NOT_VERIFIED_ERR_MSG });
    if (!ctx.brand) throw new TRPCError({ code: 'UNAUTHORIZED', message: BRAND_UNAUTHED_ERR_MSG });
    return next({ ctx: { ...ctx, user: ctx.user, brand: ctx.brand } });
  }),
);
```

User is now the auth principal — verification is checked there. `ctx.brand.emailVerified` is dead data after migration.

### 6.4 `server/db.ts`

Add:

```ts
export type AnyMembership = { brand: Brand; membershipRole: 'owner' | 'admin' | 'staff' };

export async function getAllMembershipsForUser(userId: number): Promise<AnyMembership[]>;
```

Joins `brand_members` × `brands` regardless of `brand.kind`. Returns all rows the user is a member of.

### 6.5 `server/brandRouters.ts`

**Delete** these procedures (replaced by user-side equivalents):

| Removed | Replaced by |
|---|---|
| `brandAuth.signin` | `/api/auth/signin` |
| `brandAuth.logout` | `/api/auth/logout` |
| `brandAuth.resendVerification` | `/api/auth/resend-verification` |
| `brandAuth.verifyEmail` | `/api/auth/verify-email` |
| `brandAuth.requestPasswordReset` | `/api/auth/forgot-password` |
| `brandAuth.resetPassword` | `/api/auth/reset-password` |
| `brandAuth.changePassword` | `/api/auth/reset-password` flow |

**Rewrite** `brandAuth.register`:
- Was: `publicProcedure` taking `{ companyName, email, password, contactName?, country? }`, creating brand + brand-only auth.
- Becomes: `protectedProcedure` taking `{ companyName, contactName?, country? }`. Creates a `brands` row (`kind='advertiser'`, `status='active'`, `emailVerified=true`) and a `brand_members` row owner-promoting `ctx.user`. Returns the new brand. Validates the user does not already have an owner membership in a brand of the same `companyName` (soft check; can be relaxed later).

**Update** `brandAuth.me`:
- Was: returns `safePublicBrand(ctx.brand) | null`.
- Becomes: returns `{ brand: safePublicBrand(ctx.brand) | null, memberships: Array<{ brand, membershipRole }> }`. Used by the brand-switcher.

**Add** `brandAuth.switchActiveBrand`:

```ts
switchActiveBrand: protectedProcedure
  .input(z.object({ brandId: z.number().int().positive() }))
  .mutation(async ({ ctx, input }) => {
    const memberships = await db.getAllMembershipsForUser(ctx.user.id);
    const match = memberships.find(m => m.brand.id === input.brandId);
    if (!match) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'No membership in that brand' });
    }
    setActiveBrandCookie(ctx.res, ctx.req, input.brandId);
    return { brand: safePublicBrand(match.brand) };
  }),
```

### 6.6 `server/services/brandAuth.ts`

Delete everything related to the brand-cookie or brand-password lifecycle:
- `signBrandSession`, `verifyBrandSession`
- `getBrandCookieFromRequest`, `getBrandSessionFromRequest`
- `hashPassword`, `verifyPassword`
- `tokenExpiry`, `generateToken`
- `sendBrandEmail`, `buildBrandActionUrl`
- Type `BrandSessionPayload`

**Keep**:
- `safePublicBrand` — still used to strip `passwordHash`/`passwordSalt` from brand DTOs (dead fields, but still in the row).

After this cleanup, `services/brandAuth.ts` should be ~10 lines or merge into another file.

### 6.7 `shared/const.ts`

- Remove `BRAND_COOKIE_NAME`.
- Remove `BRAND_NOT_VERIFIED_ERR_MSG` (now uses `EMAIL_NOT_VERIFIED_ERR_MSG`).
- Add `BRAND_CONTEXT_COOKIE_NAME = "brand_ctx_id"`.

## 7. Client changes

### 7.1 `client/src/pages/SignIn.tsx` — `returnTo` support

After successful login, instead of always navigating to `/dashboard`, read `?returnTo=…` from the URL and navigate there if it's a same-origin path. Defaults to `/dashboard`. Sanitization: only accept paths starting with `/` and not starting with `//` (prevents open-redirect).

### 7.2 `client/src/pages/brand/BrandLogin.tsx` — redirect

Replace the whole component with a useEffect-driven redirect to `/sign-in?returnTo=/brand/dashboard`.

### 7.3 `client/src/pages/brand/BrandForgotPassword.tsx`, `BrandResetPassword.tsx`, `BrandVerifyEmail.tsx` — redirect

Replace each with a useEffect-driven redirect to the user-side equivalent, preserving any token query param:

```tsx
useEffect(() => {
  const token = new URLSearchParams(window.location.search).get('token');
  const suffix = token ? `?token=${encodeURIComponent(token)}` : '';
  navigate(`/reset-password${suffix}`, { replace: true });
}, [navigate]);
```

### 7.4 `client/src/pages/brand/BrandRegister.tsx` — rewrite

Logged-in users see a form with `{ companyName, contactName?, country? }`. Submits to `trpc.brandAuth.register.mutate({...})`. On success, navigates to `/brand/dashboard`.

Logged-out users see a "Sign in first" card with a `Link` to `/sign-in?returnTo=/brand/register`.

### 7.5 New `client/src/components/BrandSwitcher.tsx`

Shadcn `DropdownMenu` pattern. Reads `memberships` from `trpc.brandAuth.me`. If `memberships.length === 1`, render plain text (no switcher). If 0, render null.

```tsx
<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button variant="ghost">
      Acting as: <span className="font-medium">{activeBrand.companyName}</span> <ChevronDown className="ml-1 h-4 w-4" />
    </Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent align="end">
    {memberships.map(m => (
      <DropdownMenuItem
        key={m.brand.id}
        onSelect={() => switchBrand.mutate({ brandId: m.brand.id })}
        disabled={m.brand.id === activeBrand.id}
      >
        <span className="flex-1">{m.brand.companyName}</span>
        <Badge variant="outline" className="ml-2">{m.membershipRole}</Badge>
      </DropdownMenuItem>
    ))}
  </DropdownMenuContent>
</DropdownMenu>
```

On switch: calls `trpc.brandAuth.switchActiveBrand.mutate({ brandId })`, then invalidates `trpc.brandAuth.me` so the new active brand propagates to the rest of the layout.

### 7.6 Mount point for BrandSwitcher

Investigation needed during planning: the brand portal pages may not share a common layout component. If they don't, this section grows slightly — extract a small `BrandLayout` component and wrap each brand route with it. If they do, just add `<BrandSwitcher />` to the existing header.

## 8. Rollout

Single PR, ordered commits:

1. Migration SQL + `getAllMembershipsForUser` db helper + cookie helpers + `BRAND_CONTEXT_COOKIE_NAME` const
2. `context.ts` rewrite + tests for membership resolution
3. `brandRouters.ts` cleanup: delete legacy procedures, rewrite `register`, add `switchActiveBrand`, update `me` shape
4. `services/brandAuth.ts` cleanup: delete dead helpers, keep `safePublicBrand`
5. `brandVerifiedProcedure` adds `user.emailVerified` check + tests
6. SignIn `returnTo` support
7. BrandLogin / BrandForgotPassword / BrandResetPassword / BrandVerifyEmail → redirect-only
8. BrandRegister rewrite
9. BrandSwitcher component + mounting (may include BrandLayout extraction)
10. Operator scripts: pre-flight check + post-migration reset emails

After PR merge: deploy → run migration → run pre-flight check to confirm zero unexpected state → run post-migration reset-email script.

## 9. Testing

**Vitest unit + integration**
- `getActiveBrandIdFromRequest` returns null when cookie missing, returns number when present
- `setActiveBrandCookie` writes expected attributes (httpOnly, sameSite='lax', 30-day maxAge)
- Membership resolver in `context.ts`: with 0 memberships → `ctx.brand` is null; with 1 → that brand; with multiple → cookie-selected or fallback to first
- `brandProcedure` rejects with `BRAND_UNAUTHED_ERR_MSG` when user has no memberships
- `brandVerifiedProcedure` rejects when `ctx.user.emailVerified === false` (defense-in-depth check)
- `brandAuth.register`: rejects unauthenticated; creates brand + brand_members + returns brand; rejects duplicate `companyName` for the same user
- `brandAuth.switchActiveBrand`: rejects unknown brandId; rejects brandId user doesn't belong to; sets cookie on success
- `brandAuth.me`: returns `{ brand, memberships }` with correct shape; returns `{ brand: null, memberships: [] }` for users with no memberships

**Manual smoke (PR review)**
- Sign in via `/sign-in`, hit `/brand/dashboard` — confirm a freshly migrated brand owner gets routed correctly
- `/brand/login` redirects to `/sign-in?returnTo=/brand/dashboard`
- `/brand/forgot-password?token=abc` → `/forgot-password?token=abc`
- User with two memberships sees switcher; switching changes the dashboard
- User with one membership sees plain text (no dropdown)
- User with zero memberships hitting `/brand/dashboard` gets the standard "no brand access" landing

**Operator dry-run**
- Run `scripts/check-brand-migration-readiness.sql` on a copy of prod data. Sanity-check the counts.

## 10. Open questions

- **Brand-portal layout extraction**: confirmed during planning whether `BrandLayout` exists or needs to be extracted (see §7.6).
- **One-time-cleanup migration** to drop `brands.passwordHash` / `passwordSalt` / `emailVerified`: explicitly deferred. Stays in the schema for at least one release post-deploy in case of rollback, then a small migration in a future PR drops them.
