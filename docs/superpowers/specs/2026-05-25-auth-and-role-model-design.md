# Auth Cleanup + Role Model — Design Spec

**Status:** Approved, ready for implementation planning
**Date:** 2026-05-25
**Scope:** First slice of a larger vendor-system effort. Sets the auth and role-model foundation. Vendor onboarding UI, vendor admin dashboard, and staff-invite flows are explicitly out of scope (separate future specs).

---

## 1. Problem

The Tulistica codebase has three foundational issues that block adding vendor-side features:

1. **Two parallel auth systems that don't share users.** Consumer auth (`users` table, OAuth + local password) and brand auth (`brands` table, separate cookie, separate login page). A real human cannot be both a consumer and a brand member with one identity.
2. **Role enum is too coarse.** `users.role` is `enum('user','admin')`. There is no way to express vendor admin, vendor staff, or distinguish platform super-admin from a vendor-side admin.
3. **Consumer auth is missing standard surfaces.** No password reset, no email verification, two competing sign-in pages (`/sign-in` with stale "Grocery Waze" branding vs `/login` with current "tulistica" branding). The mock dev-context casts `User` with fields (`isBlocked`, `avatarUrl`) that do not exist in the schema.

This spec resolves all three so that downstream vendor work can build on a clean foundation.

## 2. Goals / Non-goals

**Goals**
- One canonical consumer sign-in page with feature parity to brand auth (signup, signin, logout, password reset, email verification).
- A role model that supports `consumer`, `vendor_staff`, `vendor_admin`, and `super_admin`.
- A `brand_members` join table so multiple users can belong to one brand and so brand access derives from user identity (no separate brand cookie).
- A `stores.brandId` nullable FK so vendor-owned stores exist as a concept, even if no UI consumes it yet.
- Email-verification gate on consumer write actions (price reports, list sharing, becoming a vendor) — but not on browse/read.
- Type-correct mock context so `pnpm check` is green.

**Non-goals (deferred to follow-on specs)**
- Vendor application / approval workflow.
- Vendor admin dashboard (manage stores, prices, staff, billing).
- Staff invitation UI.
- Production email transport. Phase 2 reuses whatever the existing brand flow uses; if that is a dev stub, this spec inherits the same stub.
- Brand-cookie removal (defined here, executed in Phase 3 PR after this spec ships).

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Vendor entity | Reuse `brands` table with new `kind` discriminator (`advertiser` \| `vendor`) | Brands already have email verify, password reset, billing — no need to duplicate. |
| Role set | `consumer`, `vendor_staff`, `vendor_admin`, `super_admin` | Matches the four user-confirmed actor classes. `user`/`admin` is too coarse. |
| Auth unification | One login surface, memberships grant brand access. Brand cookie deprecated (Phase 3). | Cleaner mental model and one password per human. |
| Email verification | Required for writes only | Lowest friction. Sign-up + browse work without verification. Reporting prices, sharing lists, becoming a vendor require verified email. |
| Backfill | `user` → `consumer`, `admin` → `super_admin`. Existing users grandfathered as `emailVerified=true`. | Straight, non-destructive mapping. Env-based `ownerOpenId` remains a backstop. |
| Rollout | Three sequential phases (data+middleware → consumer auth UI → brand-cookie deprecation) | Each phase is independently shippable and rollback-safe. |

## 4. Schema changes

Single migration `drizzle/0009_role_unification.sql`. Applied in Phase 1.

### 4.1 `users` table

```sql
ALTER TABLE users MODIFY role ENUM(
  'consumer','vendor_staff','vendor_admin','super_admin'
) NOT NULL DEFAULT 'consumer';

UPDATE users SET role = CASE
  WHEN role = 'admin' THEN 'super_admin'
  ELSE 'consumer'
END;

ALTER TABLE users
  ADD COLUMN emailVerified TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN emailVerifiedAt TIMESTAMP NULL;

-- Grandfather all pre-existing users so the verify gate does not break them.
UPDATE users SET emailVerified = 1, emailVerifiedAt = NOW();
```

New `users` columns added to Drizzle `schema.ts`:
- `emailVerified: boolean("emailVerified").default(false).notNull()`
- `emailVerifiedAt: timestamp("emailVerifiedAt")`
- `role` enum widened as above.

The mock `User` in `server/_core/context.ts` is updated:
- **Remove** `isBlocked: false` and `avatarUrl: null` (schema does not declare these — currently relies on `as User` cast).
- **Add** `emailVerified: true, emailVerifiedAt: new Date()` so mock users can perform write actions.

### 4.2 `user_tokens` table (new)

Mirrors `brand_tokens`. Used for both email-verify and password-reset flows.

```sql
CREATE TABLE user_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  userId INT NOT NULL,
  token VARCHAR(128) NOT NULL UNIQUE,
  type ENUM('email_verify','password_reset') NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  usedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user_tokens_user (userId),
  INDEX idx_user_tokens_token (token)
);
```

### 4.3 `brands` table

```sql
ALTER TABLE brands ADD COLUMN kind ENUM('advertiser','vendor')
  NOT NULL DEFAULT 'advertiser';
```

All existing brand rows are backfilled to `advertiser` by the default.

### 4.4 `stores` table

```sql
ALTER TABLE stores ADD COLUMN brandId INT NULL;
CREATE INDEX idx_stores_brand ON stores(brandId);
```

Most rows remain `NULL` (scraped/community stores). Vendor-owned stores will set this in a later spec.

### 4.5 `brand_members` table (new)

```sql
CREATE TABLE brand_members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brandId INT NOT NULL,
  userId INT NOT NULL,
  membershipRole ENUM('owner','admin','staff') NOT NULL DEFAULT 'staff',
  invitedByUserId INT NULL,
  invitedAt TIMESTAMP NULL,
  acceptedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_brand_user (brandId, userId),
  INDEX idx_brand_members_user (userId)
);
```

`membershipRole` is intentionally a **separate axis** from `users.role`. A user's platform role (`consumer` / `super_admin`) is global; their `membershipRole` is per-brand. A `super_admin` can also be a brand `owner` of their own pet vendor; both are recorded.

The `users.role` value `vendor_admin` / `vendor_staff` is set when the user accepts their first `brand_members` invite (Phase 3, via the brand-cookie deprecation work). For Phase 1 + 2, the role-set machinery exists in the enum but no flow writes those values yet — that is fine; `super_admin` and `consumer` are exercised.

## 5. tRPC middleware (Phase 1)

In `server/_core/trpc.ts`:

```ts
export const protectedProcedure = t.procedure.use(requireUser);

export const verifiedProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: UNAUTHED_ERR_MSG });
    if (!ctx.user.emailVerified) {
      throw new TRPCError({ code: 'FORBIDDEN', message: EMAIL_NOT_VERIFIED_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const superAdminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || ctx.user.role !== 'super_admin') {
      throw new TRPCError({ code: 'FORBIDDEN', message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// any vendor team member
export const vendorStaffProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: UNAUTHED_ERR_MSG });
    const memberships = await db.getVendorMembershipsForUser(ctx.user.id);
    if (memberships.length === 0) {
      throw new TRPCError({ code: 'FORBIDDEN', message: NOT_VENDOR_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user, vendorMemberships: memberships } });
  }),
);

// vendor owner/admin only
export const vendorAdminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED', message: UNAUTHED_ERR_MSG });
    const memberships = await db.getVendorMembershipsForUser(ctx.user.id);
    const adminMemberships = memberships.filter(
      m => m.membershipRole === 'owner' || m.membershipRole === 'admin'
    );
    if (adminMemberships.length === 0) {
      throw new TRPCError({ code: 'FORBIDDEN', message: NOT_VENDOR_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user, vendorMemberships: adminMemberships } });
  }),
);

// Backwards-compat alias — existing route definitions use adminProcedure.
// Kept for one release; removed in cleanup PR after this spec ships.
export const adminProcedure = superAdminProcedure;
```

`brandProcedure` / `brandVerifiedProcedure` are **unchanged in this spec**. They keep reading the brand cookie. Phase 3 (out-of-scope follow-on) rebuilds them to use `brand_members`.

### 5.1 New `db.ts` helpers

- `getVendorMembershipsForUser(userId)` → `Promise<Array<{ brand: Brand; membershipRole: 'owner'|'admin'|'staff' }>>` — joins `brand_members` with `brands` filtered to `kind='vendor'`.
- `getAdvertiserMembershipsForUser(userId)` → same shape, filtered to `kind='advertiser'`.
- `createUserToken(userId, type, ttlMs)` → returns the generated token string; inserts a `user_tokens` row.
- `consumeUserToken(token, expectedType)` → returns `{ userId } | null`; checks not expired, not used, type matches; on success marks `usedAt=NOW()` atomically.

## 6. Consumer auth endpoints (Phase 2)

All in `server/_core/localAuth.ts`. The existing `/api/auth/signup` and `/api/auth/signin` are amended; new endpoints are appended.

| Endpoint | Method | Auth | Behavior |
|---|---|---|---|
| `/api/auth/signup` | POST | none | Creates user with `emailVerified=false`. Issues session immediately. Creates `user_tokens` row + sends verify email. Returns `{ ok: true }`. |
| `/api/auth/signin` | POST | none | Unchanged. |
| `/api/auth/logout` | POST | session | Existing; unchanged. |
| `/api/auth/forgot-password` | POST | none | Body: `{ email }`. Always returns 200 regardless of whether the email exists (no enumeration). If user exists with a `passwordHash`, creates a `password_reset` token + sends email. |
| `/api/auth/reset-password` | POST | none | Body: `{ token, newPassword }`. Validates token via `consumeUserToken`, bcrypt-hashes the new password, writes it. Returns `{ ok: true }`. |
| `/api/auth/verify-email` | POST | none | Body: `{ token }`. Validates via `consumeUserToken('email_verify')`, sets `emailVerified=true`, `emailVerifiedAt=NOW()`. Returns `{ ok: true }`. |
| `/api/auth/resend-verification` | POST | session | Rate-limited to 1 request / 60 seconds per user. Creates new token + sends email if user is not already verified. |

Token TTLs: verify token 24h; reset token 30 min.

## 7. Consumer auth pages (Phase 2)

**Deleted:** `client/src/pages/SignIn.tsx` (the duplicate with stale "Grocery Waze" branding).

**Canonical sign-in page:** `client/src/pages/SignIn.tsx` (rebuilt from `Login.tsx`) at route `/sign-in`.
- Tulistica branding, single page with two modes (signin / signup) toggled by tab.
- If `VITE_OAUTH_PORTAL_URL` and `VITE_APP_ID` are both set, render "Continuar con Tulistica" OAuth button at top + email/password form below ("o usá tu correo").
- If OAuth not configured, email/password form is primary; no broken-state messaging.
- Footer links to `/forgot-password`, terms, privacy.

**Route change in `App.tsx`:**
- `/sign-in` → canonical SignIn page.
- `/login` → redirect to `/sign-in` (for one release, then removed in a cleanup PR).

**New pages:**
- `/forgot-password` → email input → POST → "Revisá tu correo si la cuenta existe" confirmation.
- `/reset-password?token=…` → new password + confirm → POST → success → redirect to `/sign-in` with toast.
- `/verify-email?token=…` → POSTs on mount → success → redirect to `/dashboard` with toast.

**Verify-email banner:** the dashboard shell reads `user.emailVerified`. If false, a dismissible banner at the top: *"Verificá tu correo para reportar precios y crear listas compartidas."* + a "Reenviar correo" button calling `/api/auth/resend-verification`.

**Write-action gate:** all tRPC procedures that perform consumer writes get switched from `protectedProcedure` to `verifiedProcedure`. Identified list:
- `prices.report`
- `prices.vote`
- `lists.create`, `lists.update`, `lists.share`, `lists.addItem`
- `crowdedness.report`
- `pantry.add`, `pantry.update`
- `alerts.create`
- Any future write surface for vendor-application flow.

Read procedures and profile-update remain `protectedProcedure`.

## 8. Rollout

| Phase | PR contents | Risk if reverted |
|---|---|---|
| **1. Data + middleware** | Migration 0009, schema.ts updates, new tRPC procedures, new db helpers, `adminProcedure` alias, mock-context fix. **No UI change.** | None — UI is unchanged; old `adminProcedure` still works via alias. |
| **2. Consumer auth cleanup** | New endpoints, new pages, deleted duplicate SignIn, `verifiedProcedure` applied to write routes, dashboard banner. | Reverts to pre-PR state; users created in P2 stay valid (their tokens just become orphaned). |
| **3. Brand-cookie deprecation** (separate spec) | Rebuild `brandProcedure` to use `brand_members`; migrate brand login to `/sign-in`; delete brand cookie. | Out of scope here. |

## 9. Testing

**Migration (manual + scripted):**
- Apply on a fresh DB → green.
- Apply on a seeded DB (with the `seed-costa-rica.ts` data + a couple of manually inserted `user` and `admin` rows + a brand) → assert backfill is correct.

**Vitest unit tests (Phase 1 PR):**
- `verifiedProcedure` blocks unverified users with `FORBIDDEN` + `EMAIL_NOT_VERIFIED_ERR_MSG`.
- `superAdminProcedure` allows `super_admin`, blocks all other roles.
- `vendorStaffProcedure` requires ≥1 `brand_members` row on a `kind='vendor'` brand. Tested with no rows, advertiser-only membership, vendor membership.
- `vendorAdminProcedure` rejects `staff` role, allows `owner`/`admin`.
- `consumeUserToken` rejects expired, used, and wrong-type tokens.

**Vitest integration tests (Phase 2 PR):**
- `signup` creates a `user_tokens` row with `type='email_verify'`, returns 200, sets cookie.
- `forgot-password` returns 200 for unknown email (no enumeration leak).
- `reset-password` invalidates token after first use (second call returns 400).
- `verify-email` flips `emailVerified` to true.
- `resend-verification` is rate-limited (second call within 60s returns 429).

**Playwright E2E (Phase 2 PR):**
- Sign up at `/sign-in` → land on dashboard with verify banner visible.
- Attempt `prices.report` → blocked with verify message.
- Use a dev-only `/api/test/__latest-token?email=…&type=email_verify` route (gated behind `NODE_ENV !== 'production'`) to fetch the verification token.
- Visit `/verify-email?token=…` → banner disappears, write action succeeds.
- Sign out → `/forgot-password` → fetch reset token via dev route → `/reset-password` → sign in with new password.

## 10. Open questions

None blocking. The following are explicitly deferred:

- **Vendor self-registration vs invite-only:** decided in the next spec (vendor onboarding).
- **Production email transport:** Phase 2 inherits whatever the brand flow uses; production email is a separate infra spec.
- **Multi-brand switcher UI:** when a user belongs to multiple brands (e.g. one vendor + one advertiser), how do they switch? Deferred — first-pass UI in the vendor-dashboard spec will use a dropdown.
