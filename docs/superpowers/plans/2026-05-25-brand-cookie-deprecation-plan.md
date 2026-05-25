# Brand-Cookie Deprecation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the legacy brand-cookie auth surface. Brand access flows through the `brand_members` table (Phase 1) and a tiny active-brand cookie that picks which brand a multi-brand user is acting as.

**Architecture:** One migration creates `users` + `brand_members` for legacy brand-only accounts. Server's `context.ts` resolves `ctx.brand` from membership × active-brand cookie. The brand `/brand/*` portal pages keep working because `brandAuth.me` still exists — its return shape changes to `{ brand, memberships }`. Legacy brand auth procedures (signin/verify/reset) are deleted in favor of the user-side `/api/auth/*` flow added in Phase 2.

**Tech Stack:** Same as Phase 1+2 — TypeScript, React 19 + Vite, Wouter, tRPC v11, Drizzle ORM, MySQL 8, Vitest, bcryptjs.

**Source spec:** [docs/superpowers/specs/2026-05-25-brand-cookie-deprecation-design.md](../specs/2026-05-25-brand-cookie-deprecation-design.md)

---

## File map

### Server
| Path | Action | Notes |
|---|---|---|
| `shared/const.ts` | modify | remove `BRAND_COOKIE_NAME` and `BRAND_NOT_VERIFIED_ERR_MSG`; add `BRAND_CONTEXT_COOKIE_NAME` |
| `drizzle/0010_brand_to_user_migration.sql` | **create** | non-destructive INSERT-only migration |
| `server/_core/cookies.ts` | modify | add `getActiveBrandIdFromRequest`, `setActiveBrandCookie`, `clearActiveBrandCookie` |
| `server/db.ts` | modify | add `getAllMembershipsForUser` |
| `server/_core/context.ts` | modify | replace brand-cookie resolution with membership resolution |
| `server/_core/trpc.ts` | modify | `brandVerifiedProcedure` additionally requires `ctx.user.emailVerified` |
| `server/brandRouters.ts` | modify | delete 7 legacy auth procedures, rewrite `register`, add `switchActiveBrand`, update `me` |
| `server/services/brandAuth.ts` | modify | strip dead helpers; keep only `safePublicBrand` |
| `server/brand-cookie-deprecation.test.ts` | **create** | unit tests for the new behaviors |
| `scripts/check-brand-migration-readiness.sql` | **create** | pre-flight counts |
| `scripts/send-brand-password-reset-emails.ts` | **create** | post-migration operator script |

### Client
| Path | Action | Notes |
|---|---|---|
| `client/src/hooks/useBrandAuth.ts` | modify | adapt to new `{ brand, memberships }` shape from `brandAuth.me` |
| `client/src/pages/SignIn.tsx` | modify | add `?returnTo=…` support |
| `client/src/pages/brand/BrandLogin.tsx` | **replace** | redirect to `/sign-in?returnTo=/brand/dashboard` |
| `client/src/pages/brand/BrandForgotPassword.tsx` | **replace** | redirect to `/forgot-password` |
| `client/src/pages/brand/BrandResetPassword.tsx` | **replace** | redirect to `/reset-password` (preserve token) |
| `client/src/pages/brand/BrandVerifyEmail.tsx` | **replace** | redirect to `/verify-email` (preserve token) |
| `client/src/pages/brand/BrandRegister.tsx` | **rewrite** | logged-in-only brand-creation form |
| `client/src/components/BrandSwitcher.tsx` | **create** | header dropdown |
| `client/src/components/BrandLayout.tsx` | modify | switch logout/resend to user-side endpoints, rebrand to Tulistica, mount BrandSwitcher |

---

## Task 1: shared constants

**Files:**
- Modify: `shared/const.ts`

- [ ] **Step 1: Edit `shared/const.ts`**

Replace the file contents with exactly:

```ts
export const COOKIE_NAME = "app_session_id";
export const BRAND_CONTEXT_COOKIE_NAME = "brand_ctx_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const ONE_HOUR_MS = 1000 * 60 * 60;
export const THIRTY_DAYS_MS = 1000 * 60 * 60 * 24 * 30;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
export const EMAIL_NOT_VERIFIED_ERR_MSG = 'Please verify your email before continuing (10003)';
export const NOT_VENDOR_ERR_MSG = 'You are not a member of any vendor account (10004)';
export const NOT_VENDOR_ADMIN_ERR_MSG = 'You need vendor admin permission for this action (10005)';
export const BRAND_UNAUTHED_ERR_MSG = 'Please login as a brand (20001)';
```

Removed: `BRAND_COOKIE_NAME` (no more brand cookie); `BRAND_NOT_VERIFIED_ERR_MSG` (folded into `EMAIL_NOT_VERIFIED_ERR_MSG`). Added: `BRAND_CONTEXT_COOKIE_NAME` (active-brand cookie); `THIRTY_DAYS_MS` (cookie TTL).

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

EXPECTED: many type errors in places that import `BRAND_COOKIE_NAME` or `BRAND_NOT_VERIFIED_ERR_MSG`. List them mentally so subsequent tasks fix them. The schema itself should be fine.

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add shared/const.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "chore(auth): replace BRAND_COOKIE_NAME with BRAND_CONTEXT_COOKIE_NAME"
```

---

## Task 2: Add active-brand cookie helpers

**Files:**
- Modify: `server/_core/cookies.ts`

- [ ] **Step 1: Add helpers**

Open `server/_core/cookies.ts`. At the top, add to the existing imports:

```ts
import { BRAND_CONTEXT_COOKIE_NAME, THIRTY_DAYS_MS } from "@shared/const";
import { parse as parseCookieHeader } from "cookie";
import type { Request, Response } from "express";
```

(Some of these may already be imported. Don't duplicate.)

At the bottom of the file, append:

```ts
export function getActiveBrandIdFromRequest(req: Request): number | null {
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return null;
  const parsed = parseCookieHeader(cookieHeader);
  const raw = parsed[BRAND_CONTEXT_COOKIE_NAME];
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function setActiveBrandCookie(res: Response, req: Request, brandId: number): void {
  const opts = getSessionCookieOptions(req);
  res.cookie(BRAND_CONTEXT_COOKIE_NAME, String(brandId), {
    ...opts,
    maxAge: THIRTY_DAYS_MS,
  });
}

export function clearActiveBrandCookie(res: Response, req: Request): void {
  const opts = getSessionCookieOptions(req);
  res.cookie(BRAND_CONTEXT_COOKIE_NAME, "", {
    ...opts,
    maxAge: -1,
  });
}
```

If `getSessionCookieOptions` isn't exported in this file's existing surface, look at the existing function that sets `COOKIE_NAME` cookies (used in `localAuth.ts`); it lives in the same `cookies.ts`. Use the same options shape.

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: errors in `cookies.ts` should be zero. Errors elsewhere persist (from Task 1) — those get cleared in later tasks.

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add server/_core/cookies.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(auth): active-brand cookie helpers"
```

---

## Task 3: Add db helper for all memberships

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Add the helper**

The `getVendorMembershipsForUser` helper (added in Phase 1) returns only `kind='vendor'` memberships. We need a sibling that returns ALL memberships regardless of kind.

At the bottom of `server/db.ts` (after the existing `getAdvertiserMembershipsForUser` helper), append:

```ts
export type AnyMembership = { brand: Brand; membershipRole: "owner" | "admin" | "staff" };

export async function getAllMembershipsForUser(userId: number): Promise<AnyMembership[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      brand: brands,
      membershipRole: brandMembers.membershipRole,
    })
    .from(brandMembers)
    .innerJoin(brands, eq(brandMembers.brandId, brands.id))
    .where(eq(brandMembers.userId, userId));
  return rows.map(r => ({ brand: r.brand, membershipRole: r.membershipRole }));
}
```

The `brands` / `brandMembers` / `Brand` imports are already at the top of db.ts from Phase 1.

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: no new errors in db.ts.

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add server/db.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(db): getAllMembershipsForUser helper"
```

---

## Task 4: Create migration SQL

**Files:**
- Create: `drizzle/0010_brand_to_user_migration.sql`

- [ ] **Step 1: Write the migration**

Create `drizzle/0010_brand_to_user_migration.sql` with exactly:

```sql
-- 0010_brand_to_user_migration.sql
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

- [ ] **Step 2: Commit (do NOT apply — no DB in this worktree)**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add drizzle/0010_brand_to_user_migration.sql
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(db): migration 0010 — backfill users + brand_members from brands"
```

---

## Task 5: Update context.ts to resolve brand from memberships

**Files:**
- Modify: `server/_core/context.ts`

- [ ] **Step 1: Replace the brand-resolution block**

Open `server/_core/context.ts`. Find the section that resolves `brand` (was: `getBrandSessionFromRequest`). Currently this looks like:

```ts
  // Brand session lives in a separate cookie. May coexist with a user session
  // on the same browser — the two never conflict.
  try {
    const claims = await getBrandSessionFromRequest(opts.req);
    if (claims) {
      brand = (await db.getBrandById(claims.brandId)) ?? null;
    }
  } catch (error) {
    console.warn("[BrandAuth] Failed to resolve brand session:", error);
  }
```

Replace it with:

```ts
  // Brand access is now derived from brand_members. The active brand is
  // picked via the BRAND_CONTEXT_COOKIE; if missing or invalid, fall back
  // to the first membership.
  if (user) {
    try {
      const memberships = await db.getAllMembershipsForUser(user.id);
      if (memberships.length > 0) {
        const activeId = getActiveBrandIdFromRequest(opts.req);
        const active =
          memberships.find(m => m.brand.id === activeId) ?? memberships[0];
        brand = active.brand;
      }
    } catch (error) {
      console.warn("[BrandAuth] Failed to resolve brand membership:", error);
    }
  }
```

Update the imports at the top:

```ts
// Remove:
// import { getBrandSessionFromRequest } from "../services/brandAuth";

// Add:
import { getActiveBrandIdFromRequest } from "./cookies";
```

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: no new errors in context.ts itself. Other files still error from Task 1 (e.g., brandRouters.ts uses BRAND_NOT_VERIFIED_ERR_MSG and brand-cookie helpers). Those get fixed in Tasks 7+8.

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add server/_core/context.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(auth): resolve ctx.brand from brand_members + active-brand cookie"
```

---

## Task 6: Strengthen brandVerifiedProcedure

**Files:**
- Modify: `server/_core/trpc.ts`

- [ ] **Step 1: Update `brandVerifiedProcedure`**

Find the existing `brandVerifiedProcedure` block in `server/_core/trpc.ts`. Replace it with:

```ts
export const brandVerifiedProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (!ctx.user.emailVerified) {
      throw new TRPCError({ code: "FORBIDDEN", message: EMAIL_NOT_VERIFIED_ERR_MSG });
    }
    if (!ctx.brand) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: BRAND_UNAUTHED_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user, brand: ctx.brand } });
  }),
);
```

Also remove the import of `BRAND_NOT_VERIFIED_ERR_MSG` from `@shared/const` at the top of `trpc.ts` — that constant no longer exists.

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: trpc.ts is clean. Errors persist in brandRouters.ts (Task 7).

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add server/_core/trpc.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(auth): brandVerifiedProcedure also requires user.emailVerified"
```

---

## Task 7: Rewrite brandRouters.ts

**Files:**
- Modify: `server/brandRouters.ts`

This is the biggest task — we're deleting 7 procedures, rewriting 1, adding 1, updating 1.

- [ ] **Step 1: Read the current file to understand what to keep**

```
wc -l server/brandRouters.ts
head -60 server/brandRouters.ts
```

Identify all procedures inside `brandAuthRouter`. From the Phase 1 audit:
- `me` (publicProcedure.query) — KEEP, update return shape
- `register` (publicProcedure.mutation) — REWRITE
- `signin` (publicProcedure.mutation) — DELETE
- `logout` (publicProcedure/brandProcedure.mutation) — DELETE
- `resendVerification` (brandProcedure.mutation) — DELETE
- `verifyEmail` (publicProcedure.mutation) — DELETE
- `requestPasswordReset` (publicProcedure.mutation) — DELETE
- `resetPassword` (publicProcedure.mutation) — DELETE
- `changePassword` (brandProcedure.mutation) — DELETE
- `updateProfile` / similar — KEEP if exists (brand profile editing, no password)

- [ ] **Step 2: Replace the `brandAuthRouter`**

Replace the entire `brandAuthRouter` definition with this. Anything outside `brandAuthRouter` (e.g., `brandCampaignsRouter`, `brandBillingRouter` if defined in this file) stays untouched.

```ts
import { BRAND_CONTEXT_COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "./db";
import { storagePut } from "./storage";
import { setActiveBrandCookie, clearActiveBrandCookie } from "./_core/cookies";
import {
  brandProcedure,
  brandVerifiedProcedure,
  protectedProcedure,
  publicProcedure,
  router,
} from "./_core/trpc";
import { safePublicBrand } from "./services/brandAuth";

export const brandAuthRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return { brand: null, memberships: [] };
    const memberships = await db.getAllMembershipsForUser(ctx.user.id);
    return {
      brand: ctx.brand ? safePublicBrand(ctx.brand) : null,
      memberships: memberships.map(m => ({
        brand: safePublicBrand(m.brand),
        membershipRole: m.membershipRole,
      })),
    };
  }),

  register: protectedProcedure
    .input(z.object({
      companyName: z.string().trim().min(2).max(255),
      contactName: z.string().trim().max(255).optional(),
      country: z.string().trim().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Soft guardrail: don't let the same user create two brands with the
      // same companyName (typo / double-click protection).
      const existing = await db.getAllMembershipsForUser(ctx.user.id);
      if (existing.some(m =>
        m.brand.companyName.toLowerCase() === input.companyName.toLowerCase()
        && m.membershipRole === "owner"
      )) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "You already own a brand with that name",
        });
      }
      const brandId = await db.createBrand({
        companyName: input.companyName,
        email: ctx.user.email ?? `unknown+${ctx.user.id}@tulistica.local`,
        // Legacy password columns get NOT NULL placeholders. These columns
        // are dead-but-present; cleanup migration drops them later.
        passwordHash: "",
        passwordSalt: "",
        emailVerified: true,
        contactName: input.contactName,
        country: input.country,
        status: "active",
        kind: "advertiser",
      });
      if (!brandId) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create brand" });
      }
      await db.createBrandMember({
        brandId,
        userId: ctx.user.id,
        membershipRole: "owner",
        acceptedAt: new Date(),
      });
      setActiveBrandCookie(ctx.res, ctx.req, brandId);
      const brand = await db.getBrandById(brandId);
      return { brand: brand ? safePublicBrand(brand) : null };
    }),

  switchActiveBrand: protectedProcedure
    .input(z.object({ brandId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const memberships = await db.getAllMembershipsForUser(ctx.user.id);
      const match = memberships.find(m => m.brand.id === input.brandId);
      if (!match) {
        throw new TRPCError({ code: "FORBIDDEN", message: "No membership in that brand" });
      }
      setActiveBrandCookie(ctx.res, ctx.req, input.brandId);
      return { brand: safePublicBrand(match.brand) };
    }),

  updateProfile: brandVerifiedProcedure
    .input(z.object({
      companyName: z.string().trim().min(2).max(255).optional(),
      contactName: z.string().trim().max(255).optional(),
      phone: z.string().trim().max(32).optional(),
      country: z.string().trim().max(64).optional(),
      billingEmail: z.string().email().optional(),
      taxId: z.string().trim().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      await db.updateBrand(ctx.brand.id, input);
      const updated = await db.getBrandById(ctx.brand.id);
      return { brand: updated ? safePublicBrand(updated) : null };
    }),

  uploadLogo: brandVerifiedProcedure
    .input(z.object({
      contentType: z.string().regex(/^image\//),
      base64Data: z.string().max(8 * 1024 * 1024), // 8MB raw cap
    }))
    .mutation(async ({ ctx, input }) => {
      const buffer = Buffer.from(input.base64Data, "base64");
      const key = `brand-logos/${ctx.brand.id}-${Date.now()}`;
      const url = await storagePut(key, buffer, input.contentType);
      await db.updateBrand(ctx.brand.id, { logoUrl: url });
      return { logoUrl: url };
    }),
});
```

- [ ] **Step 3: Add the `createBrandMember` helper to db.ts**

Open `server/db.ts`. At the bottom, append:

```ts
export async function createBrandMember(data: InsertBrandMember): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(brandMembers).values(data);
}
```

`InsertBrandMember` is already imported at the top of db.ts (added in Phase 1).

- [ ] **Step 4: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: brandRouters.ts is clean. Remaining errors are in `services/brandAuth.ts` (Task 8) and possibly in BrandLayout.tsx etc. (Task 13). Some test files may also be referencing the deleted procedures.

If `pnpm check` reports errors in `server/brand-cookie-deprecation.test.ts` etc., those don't exist yet — that means an existing test file references a deleted procedure. Note them; Task 9 either deletes those tests or rewrites them.

If `auth.logout.test.ts`, `integrations.test.ts`, `stores.test.ts` reference `brandAuth.logout` — they don't (they test user auth.logout). Should be fine.

- [ ] **Step 5: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add server/brandRouters.ts server/db.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(auth): rebuild brandAuthRouter on brand_members + active-brand cookie"
```

---

## Task 8: Strip services/brandAuth.ts

**Files:**
- Modify: `server/services/brandAuth.ts`

- [ ] **Step 1: Replace the file contents**

Open `server/services/brandAuth.ts`. Replace with exactly:

```ts
import type { Brand } from "../../drizzle/schema";

/**
 * Strip sensitive fields from a brand row before returning to the client.
 * The passwordHash / passwordSalt columns are dead-but-present after the
 * brand-cookie deprecation; we still strip them defensively until they
 * are dropped in a future cleanup migration.
 */
export function safePublicBrand(brand: Brand) {
  const { passwordHash, passwordSalt, ...rest } = brand;
  return rest;
}
```

This deletes: `hashPassword`, `verifyPassword`, `generateToken`, `signBrandSession`, `verifyBrandSession`, `getBrandCookieFromRequest`, `getBrandSessionFromRequest`, `tokenExpiry`, `sendBrandEmail`, `buildBrandActionUrl`, type `BrandSessionPayload`. None of them are used anymore.

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: services/brandAuth.ts is clean. Errors remaining will be in client files (BrandLayout, etc.) — fixed in Tasks 10+.

If any server-side file still imports any deleted helper, that's a real error — investigate. The only legit consumer of those helpers was the OLD brandRouters.ts; Task 7 removed those imports.

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add server/services/brandAuth.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "refactor(auth): strip dead helpers from services/brandAuth.ts"
```

---

## Task 9: Tests for the new brand auth flow

**Files:**
- Create: `server/brand-cookie-deprecation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/brand-cookie-deprecation.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Brand, User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getAllMembershipsForUser: vi.fn(),
  getVendorMembershipsForUser: vi.fn(),
  getAdvertiserMembershipsForUser: vi.fn(),
  createBrand: vi.fn(),
  createBrandMember: vi.fn(),
  getBrandById: vi.fn(),
  updateBrand: vi.fn(),
}));

import * as db from "./db";
import { appRouter } from "./routers";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "u1",
    name: "User One",
    email: "u1@example.com",
    passwordHash: null,
    role: "consumer",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    trustScore: 10,
    totalPoints: 0,
    priceReportsCount: 0,
    verifiedReportsCount: 0,
    homeLatitude: null,
    homeLongitude: null,
    defaultRadiusKm: 10,
    fuelCostPerKm: 250,
    timeValuePerHour: 3000,
    preferences: null,
    loginMethod: "local",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function makeBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: 100,
    companyName: "Acme",
    email: "acme@example.com",
    passwordHash: "",
    passwordSalt: "",
    emailVerified: true,
    logoUrl: null,
    contactName: null,
    phone: null,
    country: null,
    status: "active",
    kind: "advertiser",
    billingEmail: null,
    taxId: null,
    paymentMethodLast4: null,
    paymentMethodBrand: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: null,
    ...overrides,
  };
}

function makeCtx(user: User | null, brand: Brand | null = null): TrpcContext {
  const cookies: Record<string, { value: string; options: Record<string, unknown> }> = {};
  return {
    user,
    brand,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies[name] = { value, options };
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        cookies[name] = { value: "", options };
      },
      __cookies: cookies,
    } as unknown as TrpcContext["res"],
  };
}

describe("brandAuth.me", () => {
  beforeEach(() => {
    vi.mocked(db.getAllMembershipsForUser).mockReset();
  });

  it("returns { brand: null, memberships: [] } for anonymous user", async () => {
    const caller = appRouter.createCaller(makeCtx(null, null));
    const result = await caller.brandAuth.me();
    expect(result).toEqual({ brand: null, memberships: [] });
  });

  it("returns the active brand and all memberships for a multi-brand user", async () => {
    vi.mocked(db.getAllMembershipsForUser).mockResolvedValue([
      { brand: makeBrand({ id: 100, companyName: "Acme" }), membershipRole: "owner" },
      { brand: makeBrand({ id: 200, companyName: "Beta" }), membershipRole: "staff" },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand({ id: 100 })));
    const result = await caller.brandAuth.me();
    expect(result.brand?.id).toBe(100);
    expect(result.memberships).toHaveLength(2);
    expect(result.memberships[0].membershipRole).toBe("owner");
  });
});

describe("brandAuth.switchActiveBrand", () => {
  beforeEach(() => {
    vi.mocked(db.getAllMembershipsForUser).mockReset();
  });

  it("rejects brandId the user is not a member of", async () => {
    vi.mocked(db.getAllMembershipsForUser).mockResolvedValue([
      { brand: makeBrand({ id: 100 }), membershipRole: "owner" },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    await expect(caller.brandAuth.switchActiveBrand({ brandId: 999 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("sets cookie and returns brand when user has the membership", async () => {
    vi.mocked(db.getAllMembershipsForUser).mockResolvedValue([
      { brand: makeBrand({ id: 100, companyName: "Acme" }), membershipRole: "owner" },
    ]);
    const ctx = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    const result = await caller.brandAuth.switchActiveBrand({ brandId: 100 });
    expect(result.brand.id).toBe(100);
    expect((ctx.res as any).__cookies.brand_ctx_id?.value).toBe("100");
  });

  it("rejects when user is unauthenticated", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.brandAuth.switchActiveBrand({ brandId: 100 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("brandAuth.register (rewritten)", () => {
  beforeEach(() => {
    vi.mocked(db.getAllMembershipsForUser).mockReset();
    vi.mocked(db.createBrand).mockReset();
    vi.mocked(db.createBrandMember).mockReset();
    vi.mocked(db.getBrandById).mockReset();
  });

  it("rejects unauthenticated request", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.brandAuth.register({ companyName: "Acme" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects duplicate companyName for the same user", async () => {
    vi.mocked(db.getAllMembershipsForUser).mockResolvedValue([
      { brand: makeBrand({ companyName: "Acme" }), membershipRole: "owner" },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    await expect(caller.brandAuth.register({ companyName: "Acme" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("creates brand + brand_members and sets active-brand cookie", async () => {
    vi.mocked(db.getAllMembershipsForUser).mockResolvedValue([]);
    vi.mocked(db.createBrand).mockResolvedValue(42);
    vi.mocked(db.createBrandMember).mockResolvedValue(undefined);
    vi.mocked(db.getBrandById).mockResolvedValue(makeBrand({ id: 42, companyName: "Newco" }));
    const ctx = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    const result = await caller.brandAuth.register({ companyName: "Newco" });
    expect(result.brand?.id).toBe(42);
    expect(vi.mocked(db.createBrand)).toHaveBeenCalledOnce();
    expect(vi.mocked(db.createBrandMember)).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 42, membershipRole: "owner" }),
    );
    expect((ctx.res as any).__cookies.brand_ctx_id?.value).toBe("42");
  });
});
```

- [ ] **Step 2: Run the tests (expect failure)**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm test server/brand-cookie-deprecation.test.ts
```

If the tests don't run because `appRouter` import chain breaks (services/brandAuth.ts has been gutted), inspect the error. Typically the test should pass cleanly since the appRouter doesn't reach into the deleted code.

Expected: all 7 tests pass after Tasks 7 + 8 have been applied. If any fail, investigate the specific mock or assertion.

- [ ] **Step 3: Run the full suite**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm test
```

Expected: all prior tests still pass (53) + new tests (7) = 60.

- [ ] **Step 4: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add server/brand-cookie-deprecation.test.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "test(auth): cover brandAuth.me + switchActiveBrand + register rewrites"
```

---

## Task 10: Update useBrandAuth hook

**Files:**
- Modify: `client/src/hooks/useBrandAuth.ts`

- [ ] **Step 1: Replace the file**

Open `client/src/hooks/useBrandAuth.ts`. Replace with:

```ts
import { trpc } from "@/lib/trpc";

export function useBrandAuth() {
  const { data, isLoading, refetch } = trpc.brandAuth.me.useQuery(undefined, {
    retry: false,
    staleTime: 60_000,
  });

  // After the brand-cookie deprecation, brandAuth.me returns
  // { brand, memberships } instead of just brand.
  const brand = data?.brand ?? null;
  const memberships = data?.memberships ?? [];

  return {
    brand,
    memberships,
    loading: isLoading,
    isAuthenticated: !!brand,
    isVerified: !!brand?.emailVerified,
    refetch,
  };
}
```

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: useBrandAuth.ts is clean. BrandLayout.tsx still has errors (calls `trpc.brandAuth.logout` and `trpc.brandAuth.resendVerification`). Those get fixed in Task 13.

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/hooks/useBrandAuth.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(brand-portal): useBrandAuth reads {brand, memberships}"
```

---

## Task 11: SignIn `returnTo` support

**Files:**
- Modify: `client/src/pages/SignIn.tsx`

- [ ] **Step 1: Add returnTo handling**

Open `client/src/pages/SignIn.tsx`. The current `handleSubmit` ends with `window.location.href = "/dashboard"`. Replace that line with the helper logic below.

At the top of the component (near `useState`), add:

```ts
const returnTo = (() => {
  const raw = new URLSearchParams(window.location.search).get("returnTo") ?? "";
  // Only accept same-origin paths starting with a single "/".
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/dashboard";
})();
```

Then change the success line from:
```ts
      window.location.href = "/dashboard";
```
to:
```ts
      window.location.href = returnTo;
```

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean.

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/pages/SignIn.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(auth): SignIn honors ?returnTo= after successful login"
```

---

## Task 12: Brand-portal redirect pages

**Files:**
- Replace: `client/src/pages/brand/BrandLogin.tsx`
- Replace: `client/src/pages/brand/BrandForgotPassword.tsx`
- Replace: `client/src/pages/brand/BrandResetPassword.tsx`
- Replace: `client/src/pages/brand/BrandVerifyEmail.tsx`

- [ ] **Step 1: Write `BrandLogin.tsx`**

Overwrite `client/src/pages/brand/BrandLogin.tsx` with:

```tsx
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BrandLogin() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/sign-in?returnTo=/brand/dashboard", { replace: true });
  }, [navigate]);
  return null;
}
```

- [ ] **Step 2: Write `BrandForgotPassword.tsx`**

Overwrite with:

```tsx
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BrandForgotPassword() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/forgot-password", { replace: true });
  }, [navigate]);
  return null;
}
```

- [ ] **Step 3: Write `BrandResetPassword.tsx`**

Overwrite with:

```tsx
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BrandResetPassword() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
    navigate(`/reset-password${suffix}`, { replace: true });
  }, [navigate]);
  return null;
}
```

- [ ] **Step 4: Write `BrandVerifyEmail.tsx`**

Overwrite with:

```tsx
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function BrandVerifyEmail() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    const suffix = token ? `?token=${encodeURIComponent(token)}` : "";
    navigate(`/verify-email${suffix}`, { replace: true });
  }, [navigate]);
  return null;
}
```

- [ ] **Step 5: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean (these are tiny, type-correct components).

- [ ] **Step 6: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/pages/brand/BrandLogin.tsx client/src/pages/brand/BrandForgotPassword.tsx client/src/pages/brand/BrandResetPassword.tsx client/src/pages/brand/BrandVerifyEmail.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(brand-portal): redirect legacy auth pages to user-side equivalents"
```

---

## Task 13: Rewrite BrandRegister

**Files:**
- Replace: `client/src/pages/brand/BrandRegister.tsx`

- [ ] **Step 1: Overwrite the file**

Replace `client/src/pages/brand/BrandRegister.tsx` with:

```tsx
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Receipt } from "lucide-react";

export default function BrandRegister() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [country, setCountry] = useState("");
  const registerMutation = trpc.brandAuth.register.useMutation();

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Necesitás una cuenta primero</CardTitle>
            <CardDescription>
              Iniciá sesión o creá tu cuenta personal, después podés registrar tu marca.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/sign-in?returnTo=/brand/register">
              <Button className="w-full">Ir a iniciar sesión</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await registerMutation.mutateAsync({
        companyName: companyName.trim(),
        contactName: contactName.trim() || undefined,
        country: country.trim() || undefined,
      });
      toast.success("Marca creada");
      navigate("/brand/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear la marca");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" aria-label="Volver">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <span className="font-serif text-lg flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-primary/15 text-primary grid place-items-center">
              <Receipt className="w-5 h-5" />
            </span>
            tulistica
          </span>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Registrá tu marca</CardTitle>
            <CardDescription>
              Vamos a crear el espacio de tu marca en el portal de anunciantes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="companyName">Nombre comercial</Label>
                <Input
                  id="companyName"
                  required
                  minLength={2}
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Productos La Sabana"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contactName">Nombre de contacto (opcional)</Label>
                <Input
                  id="contactName"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Tu nombre"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="country">País (opcional)</Label>
                <Input
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Costa Rica"
                />
              </div>
              <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                {registerMutation.isPending ? "Creando..." : "Crear marca"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean.

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/pages/brand/BrandRegister.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(brand-portal): BrandRegister becomes signed-in brand-creation form"
```

---

## Task 14: BrandSwitcher component + update BrandLayout

**Files:**
- Create: `client/src/components/BrandSwitcher.tsx`
- Modify: `client/src/components/BrandLayout.tsx`

This is a chunkier client-side change because BrandLayout currently calls deleted procedures and uses stale "Grocery Waze" branding.

- [ ] **Step 1: Create `BrandSwitcher.tsx`**

```tsx
// client/src/components/BrandSwitcher.tsx
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

interface Membership {
  brand: { id: number; companyName: string };
  membershipRole: "owner" | "admin" | "staff";
}

interface BrandSwitcherProps {
  activeBrandId: number;
  memberships: Membership[];
}

export function BrandSwitcher({ activeBrandId, memberships }: BrandSwitcherProps) {
  const utils = trpc.useUtils();
  const switchMutation = trpc.brandAuth.switchActiveBrand.useMutation({
    onSuccess: () => {
      utils.brandAuth.me.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (memberships.length === 0) return null;

  const active = memberships.find(m => m.brand.id === activeBrandId);

  if (memberships.length === 1) {
    return (
      <div className="text-sm text-muted-foreground px-3 py-1.5">
        {active?.brand.companyName}
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1">
          <span className="font-medium">{active?.brand.companyName ?? "Sin marca activa"}</span>
          <ChevronDown className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {memberships.map(m => (
          <DropdownMenuItem
            key={m.brand.id}
            onSelect={() => {
              if (m.brand.id !== activeBrandId) {
                switchMutation.mutate({ brandId: m.brand.id });
              }
            }}
            disabled={m.brand.id === activeBrandId}
          >
            <span className="flex-1">{m.brand.companyName}</span>
            <Badge variant="outline" className="ml-2">{m.membershipRole}</Badge>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

If `@/components/ui/dropdown-menu` and `@/components/ui/badge` don't exist, check `client/src/components/ui/` — they should be there from shadcn setup. If not, run `npx shadcn@latest add dropdown-menu badge` from the worktree root.

- [ ] **Step 2: Rewrite `client/src/components/BrandLayout.tsx`**

Open `client/src/components/BrandLayout.tsx`. The current file calls deleted procedures (`trpc.brandAuth.logout`, `trpc.brandAuth.resendVerification`) and reads `data` directly from `useBrandAuth`. Replace the file entirely with:

```tsx
import { useAuth } from "@/_core/hooks/useAuth";
import { useBrandAuth } from "@/hooks/useBrandAuth";
import { Button } from "@/components/ui/button";
import { BrandSwitcher } from "@/components/BrandSwitcher";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Megaphone,
  Receipt,
  Settings,
  LogOut,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";

const NAV = [
  { href: "/brand/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/brand/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/brand/billing", label: "Billing", icon: Receipt },
  { href: "/brand/settings", label: "Settings", icon: Settings },
];

interface BrandLayoutProps {
  children: React.ReactNode;
  requireVerified?: boolean;
}

export function BrandLayout({ children, requireVerified = false }: BrandLayoutProps) {
  const { user, loading: userLoading } = useAuth();
  const { brand, memberships, loading: brandLoading, isVerified, refetch } = useBrandAuth();
  const [location, navigate] = useLocation();
  const loading = userLoading || brandLoading;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    navigate("/sign-in?returnTo=" + encodeURIComponent(location));
    return null;
  }

  if (memberships.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md text-center space-y-4">
          <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
          <h2 className="text-xl font-semibold">No tenés acceso a una marca</h2>
          <p className="text-sm text-muted-foreground">
            Para usar el portal de marcas necesitás que te inviten o registrar tu propia marca.
          </p>
          <Link href="/brand/register">
            <Button>Registrar mi marca</Button>
          </Link>
        </div>
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      window.location.href = "/sign-in";
    } catch {
      toast.error("Logout failed");
    }
  };

  const handleResend = async () => {
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "No se pudo reenviar");
      toast.success("Correo de verificación enviado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    }
  };

  const showVerifyBanner = !!user && !user.emailVerified;
  const blockedByVerify = requireVerified && showVerifyBanner;

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex flex-col w-64 border-r bg-card">
        <Link href="/brand/dashboard" className="flex items-center gap-2 h-16 px-6 border-b">
          <div className="w-9 h-9 rounded-full bg-primary/15 text-primary grid place-items-center">
            <Receipt className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-serif text-sm">tulistica</span>
            <span className="text-xs text-muted-foreground">Portal de marcas</span>
          </div>
        </Link>

        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(item => {
            const Icon = item.icon;
            const active = location.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted"
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <div className="text-sm font-medium truncate">{brand?.companyName}</div>
          <div className="text-xs text-muted-foreground truncate">{user.email}</div>
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-3"
            onClick={handleLogout}
          >
            <LogOut className="w-4 h-4 mr-2" /> Cerrar sesión
          </Button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="border-b bg-card px-4 md:px-6 h-14 flex items-center justify-between">
          <Link href="/brand/dashboard" className="md:hidden flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary/15 text-primary grid place-items-center">
              <Receipt className="w-4 h-4" />
            </span>
            <span className="font-serif text-sm">tulistica</span>
          </Link>
          {brand && (
            <BrandSwitcher activeBrandId={brand.id} memberships={memberships} />
          )}
          <Button variant="ghost" size="sm" className="md:hidden" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
          </Button>
        </header>

        {showVerifyBanner && (
          <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <p className="text-sm">
                Verificá tu correo <strong>{user.email}</strong> para publicar campañas o descargar facturas.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={handleResend}
            >
              Reenviar correo
            </Button>
          </div>
        )}

        {blockedByVerify ? (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="max-w-md text-center space-y-3">
              <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
              <h2 className="text-xl font-semibold">Verificación de correo requerida</h2>
              <p className="text-sm text-muted-foreground">
                Confirmá tu correo antes de acceder a esta página. Te mandamos un enlace
                a <strong>{user.email}</strong>.
              </p>
              <Button onClick={handleResend}>Reenviar correo</Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 p-6 md:p-8">{children}</div>
        )}
      </main>
    </div>
  );
}
```

Key changes from the old BrandLayout:
- Reads user via `useAuth()`, brand + memberships via `useBrandAuth()`.
- Logout via `fetch('/api/auth/logout')` (no more `trpc.brandAuth.logout`).
- Resend via `fetch('/api/auth/resend-verification')` (no more `trpc.brandAuth.resendVerification`).
- Verify check uses `user.emailVerified`, not `brand.emailVerified`.
- Tulistica branding throughout.
- Renders `<BrandSwitcher>` in the header.
- Routes to `/sign-in?returnTo=…` instead of `/brand/login`.
- Shows a "no brand access" landing if user has zero memberships (instead of looping back to login).

- [ ] **Step 3: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean.

- [ ] **Step 4: Test suite**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm test
```

Expected: 60/60 PASS.

- [ ] **Step 5: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/components/BrandSwitcher.tsx client/src/components/BrandLayout.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(brand-portal): brand switcher + rebrand layout to Tulistica + use user-auth"
```

---

## Task 15: Operator scripts

**Files:**
- Create: `scripts/check-brand-migration-readiness.sql`
- Create: `scripts/send-brand-password-reset-emails.ts`

- [ ] **Step 1: Write the pre-flight SQL**

Create `scripts/check-brand-migration-readiness.sql`:

```sql
-- scripts/check-brand-migration-readiness.sql
-- Read-only counts to preview what migration 0010 will touch.
-- Usage: mysql tulistica < scripts/check-brand-migration-readiness.sql

SELECT COUNT(*) AS brands_to_migrate
FROM brands b
WHERE LOWER(b.email) NOT IN (SELECT LOWER(email) FROM users WHERE email IS NOT NULL);

SELECT COUNT(*) AS brands_missing_membership
FROM brands b
WHERE NOT EXISTS (SELECT 1 FROM brand_members bm WHERE bm.brandId = b.id);

SELECT COUNT(*) AS shared_user_collisions
FROM brands b
WHERE LOWER(b.email) IN (SELECT LOWER(email) FROM users WHERE email IS NOT NULL);
```

- [ ] **Step 2: Write the password-reset email script**

Create `scripts/send-brand-password-reset-emails.ts`:

```ts
#!/usr/bin/env tsx
/**
 * One-off operator script. Run AFTER migration 0010 has been applied.
 *
 *   pnpm tsx scripts/send-brand-password-reset-emails.ts
 *
 * Iterates users that were synthesized by the migration (loginMethod =
 * 'brand-migration' AND passwordHash IS NULL) and sends each one a password
 * reset link via the standard user-auth flow.
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "../server/db";
import { createUserToken } from "../server/db";
import { users } from "../drizzle/schema";
import {
  generateUserToken,
  userTokenExpiry,
  buildUserActionUrl,
  sendUserEmail,
} from "../server/services/userAuth";
import { ENV } from "../server/_core/env";

function appBaseUrl(): string {
  return (ENV as any).appBaseUrl ?? "http://localhost:3000";
}

async function main() {
  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL not configured");
    process.exit(1);
  }

  const candidates = await db
    .select()
    .from(users)
    .where(and(eq(users.loginMethod, "brand-migration"), isNull(users.passwordHash)));

  console.log(`Found ${candidates.length} migrated brand users without a password.`);

  for (const u of candidates) {
    if (!u.email) {
      console.warn(`  user id=${u.id} has no email — skipping`);
      continue;
    }
    const token = generateUserToken();
    await createUserToken({
      userId: u.id,
      token,
      type: "password_reset",
      expiresAt: userTokenExpiry("password_reset"),
    });
    const url = buildUserActionUrl(appBaseUrl(), "reset-password", token);
    const result = await sendUserEmail({
      to: u.email,
      subject: "Set your Tulistica password",
      body: `Hola ${u.name ?? ""},\n\nTu cuenta de marca fue migrada al nuevo sistema. Configurá tu contraseña abriendo este enlace (válido 30 minutos):\n${url}\n\nDespués de configurarla podés iniciar sesión en /sign-in.`,
    });
    console.log(`  sent to ${u.email} — delivered=${result.delivered}`);
  }

  console.log("Done.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 3: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean.

- [ ] **Step 4: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add scripts/check-brand-migration-readiness.sql scripts/send-brand-password-reset-emails.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "ops: pre-flight check + post-migration password-reset email script"
```

---

# Final verification

- [ ] **Step 1: Full test suite**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm test
```

Expected: 60/60 PASS (53 prior + 7 new).

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean.

- [ ] **Step 3: Production build**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm build
```

Expected: succeeds.

- [ ] **Step 4: Smoke-test the brand-portal redirects (optional, if dev server running)**

- `/brand/login` → `/sign-in?returnTo=/brand/dashboard`
- `/brand/forgot-password` → `/forgot-password`
- `/brand/reset-password?token=foo` → `/reset-password?token=foo`
- `/brand/verify-email?token=foo` → `/verify-email?token=foo`
- `/brand/register` (logged out) → "necesitás una cuenta primero" card
