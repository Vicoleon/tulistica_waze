# Auth Cleanup + Role Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lay the auth/role-model foundation for vendor work. Expand the role enum, add `brand_members` + `stores.brandId`, give consumers feature parity with brand auth (verify, reset), and switch write actions to require a verified email.

**Architecture:** Two phases shipped as separate sets of commits.
- **Phase 1** (data + middleware): one migration plus server-only changes. No UI moves. App stays green and behaves identically.
- **Phase 2** (consumer auth UI): new endpoints, new pages, banner, write-procedure gating.

**Tech Stack:** TypeScript, React 19 + Vite, Wouter, tRPC v11, Drizzle ORM, MySQL 8, Vitest, bcryptjs (consumer passwords — unchanged), scrypt (brand passwords — unchanged), `jose` (JWT sessions — unchanged).

**Source spec:** [docs/superpowers/specs/2026-05-25-auth-and-role-model-design.md](../specs/2026-05-25-auth-and-role-model-design.md)

---

## File map

### Phase 1
| Path | Action | Notes |
|---|---|---|
| `shared/const.ts` | modify | add new error message constants |
| `drizzle/0009_role_unification.sql` | **create** | the single migration for the whole role/auth model change |
| `drizzle/schema.ts` | modify | role enum, emailVerified columns, brands.kind, stores.brandId, new userTokens + brandMembers tables |
| `server/services/userAuth.ts` | **create** | token primitives + dev email send (mirror of services/brandAuth.ts) |
| `server/db.ts` | modify | add `createUserToken`, `consumeUserToken`, `invalidateUserTokensOfType`, `markUserEmailVerified`, `setUserPasswordHash`, `getVendorMembershipsForUser`, `getAdvertiserMembershipsForUser` |
| `server/_core/context.ts` | modify | remove phantom `isBlocked`/`avatarUrl`, add `emailVerified` + `emailVerifiedAt` to mock; promote dev-mock to `super_admin` |
| `server/_core/trpc.ts` | modify | add `verifiedProcedure`, `superAdminProcedure`, `vendorStaffProcedure`, `vendorAdminProcedure`; keep `adminProcedure` as alias |
| `server/_core/localAuth.ts` | modify | signup writes `consumer` role; backstop for owner becomes `super_admin` |
| `server/auth.logout.test.ts` | modify | role literal `"user"` → `"consumer"` |
| `server/integrations.test.ts` | modify | same |
| `server/stores.test.ts` | modify | same |
| `server/services/userAuth.test.ts` | **create** | unit tests for token expiry, generation, etc. |
| `server/trpc.middleware.test.ts` | **create** | tests for new procedures (mocked DB) |

### Phase 2
| Path | Action | Notes |
|---|---|---|
| `server/_core/localAuth.ts` | modify | signup creates verify token + sends email; add forgot/reset/verify/resend endpoints |
| `server/routers.ts` | modify | swap `protectedProcedure` → `verifiedProcedure` for write surfaces |
| `client/src/pages/SignIn.tsx` | **delete then create** | scrap stale "Grocery Waze" page; new canonical Tulistica-branded page with OAuth + password form |
| `client/src/pages/Login.tsx` | **delete** | merged into SignIn |
| `client/src/pages/ForgotPassword.tsx` | **create** | email → POST → confirmation |
| `client/src/pages/ResetPassword.tsx` | **create** | token+password → POST → redirect |
| `client/src/pages/VerifyEmail.tsx` | **create** | auto-POST token on mount |
| `client/src/components/VerifyEmailBanner.tsx` | **create** | dismissible banner |
| `client/src/App.tsx` | modify | route `/sign-in` is canonical; `/login` redirects to it; new routes for forgot/reset/verify |
| `client/src/pages/Dashboard.tsx` | modify | mount banner above content |
| `server/auth.signup-verify.test.ts` | **create** | integration test |
| `server/auth.password-reset.test.ts` | **create** | integration test |

---

# PHASE 1 — Data + middleware

## Task 1: Add error message constants

**Files:**
- Modify: `shared/const.ts`

- [ ] **Step 1: Edit `shared/const.ts`**

Replace the file contents with:

```ts
export const COOKIE_NAME = "app_session_id";
export const BRAND_COOKIE_NAME = "brand_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const ONE_HOUR_MS = 1000 * 60 * 60;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
export const EMAIL_NOT_VERIFIED_ERR_MSG = 'Please verify your email before continuing (10003)';
export const NOT_VENDOR_ERR_MSG = 'You are not a member of any vendor account (10004)';
export const NOT_VENDOR_ADMIN_ERR_MSG = 'You need vendor admin permission for this action (10005)';
export const BRAND_UNAUTHED_ERR_MSG = 'Please login as a brand (20001)';
export const BRAND_NOT_VERIFIED_ERR_MSG = 'Please verify your email before continuing (20002)';
```

- [ ] **Step 2: Type-check**

Run: `pnpm check`
Expected: PASS (no other code references these new constants yet).

- [ ] **Step 3: Commit**

```bash
git add shared/const.ts
git commit -m "feat(auth): add error constants for verify/vendor gating"
```

---

## Task 2: Create the migration SQL

**Files:**
- Create: `drizzle/0009_role_unification.sql`

- [ ] **Step 1: Create the migration file**

Write `drizzle/0009_role_unification.sql`:

```sql
-- 0009_role_unification.sql
-- Expands the user role model, adds email verification on users,
-- introduces brand_members + stores.brandId, and adds a brands.kind
-- discriminator so a brand can be either an advertiser or a vendor.

-- 1. Widen users.role and backfill existing values
ALTER TABLE users MODIFY role ENUM(
  'consumer','vendor_staff','vendor_admin','super_admin'
) NOT NULL DEFAULT 'consumer';

UPDATE users SET role = 'super_admin' WHERE role = 'admin';
UPDATE users SET role = 'consumer' WHERE role NOT IN (
  'consumer','vendor_staff','vendor_admin','super_admin'
);

-- 2. Email verification columns on users
ALTER TABLE users
  ADD COLUMN emailVerified TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN emailVerifiedAt TIMESTAMP NULL;

-- Grandfather existing users as verified to avoid breaking their flows.
UPDATE users SET emailVerified = 1, emailVerifiedAt = NOW();

-- 3. user_tokens table for verify + reset
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

-- 4. brands.kind discriminator
ALTER TABLE brands ADD COLUMN kind ENUM('advertiser','vendor')
  NOT NULL DEFAULT 'advertiser';

-- 5. stores.brandId
ALTER TABLE stores ADD COLUMN brandId INT NULL;
CREATE INDEX idx_stores_brand ON stores(brandId);

-- 6. brand_members join table
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

- [ ] **Step 2: Apply the migration**

Run: `pnpm db:push`
Expected: drizzle-kit reports applying migration 0009 successfully; subsequent runs report "no pending migrations".

If `pnpm db:push` fails because DATABASE_URL is not set in this environment, document the migration as ready and continue — it will run in CI/staging.

- [ ] **Step 3: Verify the schema in MySQL (optional but recommended)**

If you have psql/mysql access, run:
```sql
DESCRIBE users;          -- should show role enum with 4 values and emailVerified column
SHOW CREATE TABLE user_tokens;
SHOW CREATE TABLE brand_members;
DESCRIBE brands;         -- should show 'kind' enum column
DESCRIBE stores;         -- should show 'brandId' column
```

- [ ] **Step 4: Commit**

```bash
git add drizzle/0009_role_unification.sql
git commit -m "feat(db): migration 0009 — role unification + user_tokens + brand_members"
```

---

## Task 3: Update Drizzle schema.ts

**Files:**
- Modify: `drizzle/schema.ts`

- [ ] **Step 1: Update the `users` table definition**

Open `drizzle/schema.ts`. Find the `users` table (lines 4–30). Replace the `role` line and add the two new email-verify columns:

Find:
```ts
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
```

Replace with:
```ts
  role: mysqlEnum("role", ["consumer", "vendor_staff", "vendor_admin", "super_admin"]).default("consumer").notNull(),
  emailVerified: boolean("emailVerified").default(false).notNull(),
  emailVerifiedAt: timestamp("emailVerifiedAt"),
```

- [ ] **Step 2: Update the `brands` table definition**

Find the `brands` table (around line 224). After the `status` enum line, add:

```ts
  kind: mysqlEnum("kind", ["advertiser", "vendor"]).default("advertiser").notNull(),
```

- [ ] **Step 3: Update the `stores` table definition**

Find the `stores` table (around line 36). Inside the column list, before `createdAt`, add:

```ts
  brandId: int("brandId"),
```

And inside the indexes block at the bottom of the table definition, add `index("idx_stores_brand").on(table.brandId),`.

- [ ] **Step 4: Add the `userTokens` table**

After the `users` table (line 33 or so), insert:

```ts
// ============ USER TOKENS (email verify + password reset) ============
export const userTokens = mysqlTable("user_tokens", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  token: varchar("token", { length: 128 }).notNull().unique(),
  type: mysqlEnum("type", ["email_verify", "password_reset"]).notNull(),
  expiresAt: timestamp("expiresAt").notNull(),
  usedAt: timestamp("usedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("idx_user_tokens_user").on(table.userId),
  index("idx_user_tokens_token").on(table.token),
]);

export type UserToken = typeof userTokens.$inferSelect;
export type InsertUserToken = typeof userTokens.$inferInsert;
```

- [ ] **Step 5: Add the `brandMembers` table**

After the `brandTokens` table (around line 267), insert:

```ts
// ============ BRAND MEMBERS (user ↔ brand join) ============
export const brandMembers = mysqlTable("brand_members", {
  id: int("id").autoincrement().primaryKey(),
  brandId: int("brandId").notNull(),
  userId: int("userId").notNull(),
  membershipRole: mysqlEnum("membershipRole", ["owner", "admin", "staff"]).default("staff").notNull(),
  invitedByUserId: int("invitedByUserId"),
  invitedAt: timestamp("invitedAt"),
  acceptedAt: timestamp("acceptedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => [
  index("uniq_brand_user").on(table.brandId, table.userId),
  index("idx_brand_members_user").on(table.userId),
]);

export type BrandMember = typeof brandMembers.$inferSelect;
export type InsertBrandMember = typeof brandMembers.$inferInsert;
```

- [ ] **Step 6: Type-check**

Run: `pnpm check`
Expected: a small number of failures pointing at the four places that hardcode the old role values: `server/auth.logout.test.ts`, `server/integrations.test.ts`, `server/stores.test.ts`, `server/_core/context.ts`, `server/_core/localAuth.ts`. We fix those in the next tasks. The schema itself should type-check cleanly.

- [ ] **Step 7: Commit**

```bash
git add drizzle/schema.ts
git commit -m "feat(db): widen users.role enum and add userTokens/brandMembers tables"
```

---

## Task 4: Create userAuth service

**Files:**
- Create: `server/services/userAuth.ts`
- Create: `server/services/userAuth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `server/services/userAuth.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  generateUserToken,
  userTokenExpiry,
  buildUserActionUrl,
} from "./userAuth";

describe("userAuth helpers", () => {
  it("generateUserToken returns a 64-char hex string", () => {
    const token = generateUserToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generateUserToken returns a unique value on each call", () => {
    const a = generateUserToken();
    const b = generateUserToken();
    expect(a).not.toBe(b);
  });

  it("userTokenExpiry('email_verify') is 24 hours in the future", () => {
    const before = Date.now();
    const expiry = userTokenExpiry("email_verify").getTime();
    const after = Date.now();
    const expectedLow = before + 24 * 60 * 60 * 1000;
    const expectedHigh = after + 24 * 60 * 60 * 1000;
    expect(expiry).toBeGreaterThanOrEqual(expectedLow);
    expect(expiry).toBeLessThanOrEqual(expectedHigh + 1000);
  });

  it("userTokenExpiry('password_reset') is 30 minutes in the future", () => {
    const before = Date.now();
    const expiry = userTokenExpiry("password_reset").getTime();
    const after = Date.now();
    const expectedLow = before + 30 * 60 * 1000;
    const expectedHigh = after + 30 * 60 * 1000;
    expect(expiry).toBeGreaterThanOrEqual(expectedLow);
    expect(expiry).toBeLessThanOrEqual(expectedHigh + 1000);
  });

  it("buildUserActionUrl encodes the token and trims trailing slashes", () => {
    const url = buildUserActionUrl("https://app.tulistica.cr/", "verify-email", "abc/=def");
    expect(url).toBe("https://app.tulistica.cr/verify-email?token=abc%2F%3Ddef");
  });
});
```

- [ ] **Step 2: Run the test (expected to fail)**

Run: `pnpm test server/services/userAuth.test.ts`
Expected: FAIL with "Cannot find module './userAuth'".

- [ ] **Step 3: Implement the service**

Create `server/services/userAuth.ts`:

```ts
import { randomBytes } from "node:crypto";
import { ONE_HOUR_MS } from "@shared/const";
import { notifyOwner } from "../_core/notification";

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;

export type UserTokenType = "email_verify" | "password_reset";
export type UserActionPath = "verify-email" | "reset-password" | "forgot-password";

export function generateUserToken(byteLen = 32): string {
  return randomBytes(byteLen).toString("hex");
}

export function userTokenExpiry(kind: UserTokenType): Date {
  if (kind === "email_verify") {
    return new Date(Date.now() + TWENTY_FOUR_HOURS_MS);
  }
  return new Date(Date.now() + THIRTY_MINUTES_MS);
}

export function buildUserActionUrl(
  baseUrl: string,
  path: UserActionPath,
  token: string
): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  return `${trimmed}/${path}?token=${encodeURIComponent(token)}`;
}

/**
 * Dispatch a user-facing email. Mirrors sendBrandEmail — logs the body and
 * notifies the platform owner so they can manually relay during MVP/dev.
 * Production wiring (SMTP/SendGrid) is a separate infra task.
 */
export async function sendUserEmail(opts: {
  to: string;
  subject: string;
  body: string;
}): Promise<{ delivered: boolean }> {
  console.log(`[UserEmail] to=${opts.to} subject="${opts.subject}"\n${opts.body}`);
  try {
    await notifyOwner({
      title: `[Tulistica] ${opts.subject}`,
      content: `User: ${opts.to}\n\n${opts.body}`,
    });
    return { delivered: true };
  } catch (error) {
    console.warn("[UserEmail] notifyOwner failed", error);
    return { delivered: false };
  }
}

export const USER_RESEND_COOLDOWN_MS = RESEND_COOLDOWN_MS;
// re-export so callers don't need a separate import
export { ONE_HOUR_MS };
```

- [ ] **Step 4: Run the tests (expected to pass)**

Run: `pnpm test server/services/userAuth.test.ts`
Expected: PASS (all five tests).

- [ ] **Step 5: Commit**

```bash
git add server/services/userAuth.ts server/services/userAuth.test.ts
git commit -m "feat(auth): userAuth service for verify/reset token primitives"
```

---

## Task 5: Add db helpers for user tokens, brand members, and email verify

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Locate and update the schema imports at the top of `server/db.ts`**

Open `server/db.ts`. Run `head -30 server/db.ts` to find the existing import from `"../drizzle/schema"`. It is likely a multi-line import that already pulls in `users`, `brands`, `brandTokens`, etc. Add the new symbols to that same import: `userTokens, brandMembers`. Also add the new types to the existing `import type` from that same module: `UserToken, InsertUserToken, BrandMember, InsertBrandMember`.

Do **not** duplicate the import block — extend the existing one.

- [ ] **Step 2: Append the new helpers at the bottom of `server/db.ts`**

Append:

```ts
// ============ USER TOKEN HELPERS ============
// (imports of userTokens, brandMembers, UserToken, InsertUserToken, BrandMember
// already added to the top-of-file schema import block in Step 1.)

export async function createUserToken(data: InsertUserToken): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(userTokens).values(data);
}

export async function getUserToken(token: string): Promise<UserToken | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db.select().from(userTokens).where(eq(userTokens.token, token)).limit(1);
  return rows[0];
}

/**
 * Atomically validate + consume a token. Returns the userId on success.
 * Returns null if the token is missing, used, expired, or of the wrong type.
 */
export async function consumeUserToken(
  token: string,
  expectedType: "email_verify" | "password_reset"
): Promise<{ userId: number } | null> {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(userTokens).where(eq(userTokens.token, token)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.type !== expectedType) return null;
  if (row.usedAt) return null;
  if (row.expiresAt.getTime() < Date.now()) return null;
  await db.update(userTokens).set({ usedAt: new Date() }).where(eq(userTokens.id, row.id));
  return { userId: row.userId };
}

export async function invalidateUserTokensOfType(
  userId: number,
  type: "email_verify" | "password_reset"
): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(userTokens)
    .set({ usedAt: new Date() })
    .where(and(
      eq(userTokens.userId, userId),
      eq(userTokens.type, type),
      isNull(userTokens.usedAt),
    ));
}

export async function markUserEmailVerified(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users)
    .set({ emailVerified: true, emailVerifiedAt: new Date() })
    .where(eq(users.id, userId));
}

export async function setUserPasswordHash(userId: number, passwordHash: string): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

// ============ BRAND MEMBER HELPERS ============
export type VendorMembership = { brand: Brand; membershipRole: "owner" | "admin" | "staff" };

export async function getVendorMembershipsForUser(userId: number): Promise<VendorMembership[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      brand: brands,
      membershipRole: brandMembers.membershipRole,
    })
    .from(brandMembers)
    .innerJoin(brands, eq(brandMembers.brandId, brands.id))
    .where(and(eq(brandMembers.userId, userId), eq(brands.kind, "vendor")));
  return rows.map(r => ({ brand: r.brand, membershipRole: r.membershipRole }));
}

export async function getAdvertiserMembershipsForUser(userId: number): Promise<VendorMembership[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      brand: brands,
      membershipRole: brandMembers.membershipRole,
    })
    .from(brandMembers)
    .innerJoin(brands, eq(brandMembers.brandId, brands.id))
    .where(and(eq(brandMembers.userId, userId), eq(brands.kind, "advertiser")));
  return rows.map(r => ({ brand: r.brand, membershipRole: r.membershipRole }));
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm check`
Expected: PASS. If there's a complaint about `users` not being imported, ensure the existing `users` import at the top of db.ts is preserved.

- [ ] **Step 4: Commit**

```bash
git add server/db.ts
git commit -m "feat(db): helpers for user_tokens, brand_members, and email-verified"
```

---

## Task 6: Fix the mock context phantom-columns bug

**Files:**
- Modify: `server/_core/context.ts`

- [ ] **Step 1: Edit the mock user**

Open `server/_core/context.ts`. Find the mock user object (around lines 47–71). It currently casts a `User` literal that includes `isBlocked: false` and `avatarUrl: null` — neither field exists in the schema. It also uses `role: "admin"` which is no longer a valid enum value.

Replace the whole block:

```ts
      user = {
        id: 1,
        openId: ENV.ownerOpenId || "mock-user-id",
        name: "Mock User",
        email: "mock@local.dev",
        passwordHash: null,
        role: "admin", // Admin access for development
        trustScore: 100,
        totalPoints: 1000,
        createdAt: new Date(),
        lastSignedIn: new Date(),
        loginMethod: "mock",
        isBlocked: false,
        avatarUrl: null,
        homeLatitude: 9.9281,
        homeLongitude: -84.0907,
        fuelCostPerKm: 250, // ₡250/km CRC
        timeValuePerHour: 3000, // ₡3,000/hr CRC
        priceReportsCount: 0,
        verifiedReportsCount: 0,
        defaultRadiusKm: 10,
        preferences: mockPrefs,
        updatedAt: new Date(),
      } as User;
```

with:

```ts
      user = {
        id: 1,
        openId: ENV.ownerOpenId || "mock-user-id",
        name: "Mock User",
        email: "mock@local.dev",
        passwordHash: null,
        role: "super_admin",
        emailVerified: true,
        emailVerifiedAt: new Date(),
        trustScore: 100,
        totalPoints: 1000,
        createdAt: new Date(),
        lastSignedIn: new Date(),
        loginMethod: "mock",
        homeLatitude: 9.9281,
        homeLongitude: -84.0907,
        fuelCostPerKm: 250,
        timeValuePerHour: 3000,
        priceReportsCount: 0,
        verifiedReportsCount: 0,
        defaultRadiusKm: 10,
        preferences: mockPrefs,
        updatedAt: new Date(),
      } satisfies User;
```

Note the change from `as User` to `satisfies User` — this turns the cast into a structural check, which is what catches future drift between the mock and the schema.

- [ ] **Step 2: Type-check**

Run: `pnpm check`
Expected: PASS for `context.ts`. If type errors surface about missing fields, the schema in Task 3 was incomplete — recheck.

- [ ] **Step 3: Commit**

```bash
git add server/_core/context.ts
git commit -m "fix(auth): remove phantom mock-user fields, promote dev mock to super_admin"
```

---

## Task 7: Update tRPC middleware

**Files:**
- Modify: `server/_core/trpc.ts`
- Create: `server/trpc.middleware.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `server/trpc.middleware.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Brand, User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

// Mock the db module before importing trpc so getVendorMembershipsForUser is stubbable.
vi.mock("./db", () => ({
  getVendorMembershipsForUser: vi.fn(),
  getAdvertiserMembershipsForUser: vi.fn(),
}));

import * as db from "./db";
import {
  protectedProcedure,
  verifiedProcedure,
  superAdminProcedure,
  vendorStaffProcedure,
  vendorAdminProcedure,
  router,
} from "./_core/trpc";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "test-user",
    name: "Test",
    email: "test@example.com",
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

function makeCtx(user: User | null, brand: Brand | null = null): TrpcContext {
  return {
    user,
    brand,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function makeBrand(kind: "vendor" | "advertiser" = "vendor"): Brand {
  return {
    id: 99,
    companyName: "Acme",
    email: "acme@example.com",
    passwordHash: "h",
    passwordSalt: "s",
    emailVerified: true,
    logoUrl: null,
    contactName: null,
    phone: null,
    country: null,
    status: "active",
    kind,
    billingEmail: null,
    taxId: null,
    paymentMethodLast4: null,
    paymentMethodBrand: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: null,
  };
}

describe("verifiedProcedure", () => {
  it("blocks unverified user with FORBIDDEN", async () => {
    const r = router({ x: verifiedProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser({ emailVerified: false })));
    await expect(caller.x()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows verified user", async () => {
    const r = router({ x: verifiedProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser({ emailVerified: true })));
    await expect(caller.x()).resolves.toBe("ok");
  });

  it("blocks no-user with UNAUTHORIZED", async () => {
    const r = router({ x: verifiedProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(null));
    await expect(caller.x()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("superAdminProcedure", () => {
  it("allows super_admin", async () => {
    const r = router({ x: superAdminProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser({ role: "super_admin" })));
    await expect(caller.x()).resolves.toBe("ok");
  });

  it("blocks consumer with FORBIDDEN", async () => {
    const r = router({ x: superAdminProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.x()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks vendor_admin with FORBIDDEN (different role)", async () => {
    const r = router({ x: superAdminProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser({ role: "vendor_admin" })));
    await expect(caller.x()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("vendorStaffProcedure", () => {
  beforeEach(() => {
    vi.mocked(db.getVendorMembershipsForUser).mockReset();
  });

  it("blocks user with no vendor memberships", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([]);
    const r = router({ x: vendorStaffProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser()));
    await expect(caller.x()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows user with at least one vendor membership", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand("vendor"), membershipRole: "staff" },
    ]);
    const r = router({ x: vendorStaffProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser()));
    await expect(caller.x()).resolves.toBe("ok");
  });
});

describe("vendorAdminProcedure", () => {
  beforeEach(() => {
    vi.mocked(db.getVendorMembershipsForUser).mockReset();
  });

  it("rejects user whose only membership is staff role", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand("vendor"), membershipRole: "staff" },
    ]);
    const r = router({ x: vendorAdminProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser()));
    await expect(caller.x()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows owner", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand("vendor"), membershipRole: "owner" },
    ]);
    const r = router({ x: vendorAdminProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser()));
    await expect(caller.x()).resolves.toBe("ok");
  });

  it("allows admin", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand("vendor"), membershipRole: "admin" },
    ]);
    const r = router({ x: vendorAdminProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser()));
    await expect(caller.x()).resolves.toBe("ok");
  });
});
```

- [ ] **Step 2: Run the tests (expected to fail)**

Run: `pnpm test server/trpc.middleware.test.ts`
Expected: FAIL with missing exports (`verifiedProcedure`, `superAdminProcedure`, `vendorStaffProcedure`, `vendorAdminProcedure`).

- [ ] **Step 3: Update `server/_core/trpc.ts`**

Replace the contents with:

```ts
import {
  BRAND_NOT_VERIFIED_ERR_MSG,
  BRAND_UNAUTHED_ERR_MSG,
  EMAIL_NOT_VERIFIED_ERR_MSG,
  NOT_ADMIN_ERR_MSG,
  NOT_VENDOR_ADMIN_ERR_MSG,
  NOT_VENDOR_ERR_MSG,
  UNAUTHED_ERR_MSG,
} from "@shared/const";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import * as db from "../db";
import type { TrpcContext } from "./context";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const verifiedProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (!ctx.user.emailVerified) {
      throw new TRPCError({ code: "FORBIDDEN", message: EMAIL_NOT_VERIFIED_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

export const superAdminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user || ctx.user.role !== "super_admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, user: ctx.user } });
  }),
);

// Backwards-compat alias used by existing admin.* routes.
// Remove after callers are migrated (cleanup PR).
export const adminProcedure = superAdminProcedure;

export const vendorStaffProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    const memberships = await db.getVendorMembershipsForUser(ctx.user.id);
    if (memberships.length === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_VENDOR_ERR_MSG });
    }
    return next({
      ctx: { ...ctx, user: ctx.user, vendorMemberships: memberships },
    });
  }),
);

export const vendorAdminProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    const memberships = await db.getVendorMembershipsForUser(ctx.user.id);
    const adminMemberships = memberships.filter(
      m => m.membershipRole === "owner" || m.membershipRole === "admin",
    );
    if (adminMemberships.length === 0) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_VENDOR_ADMIN_ERR_MSG });
    }
    return next({
      ctx: { ...ctx, user: ctx.user, vendorMemberships: adminMemberships },
    });
  }),
);

// Brand-cookie auth — unchanged in this spec. Rebuilt in Phase 3 (future spec).
const requireBrand = t.middleware(async ({ ctx, next }) => {
  if (!ctx.brand) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: BRAND_UNAUTHED_ERR_MSG });
  }
  return next({ ctx: { ...ctx, brand: ctx.brand } });
});

export const brandProcedure = t.procedure.use(requireBrand);

export const brandVerifiedProcedure = t.procedure.use(
  t.middleware(async ({ ctx, next }) => {
    if (!ctx.brand) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: BRAND_UNAUTHED_ERR_MSG });
    }
    if (!ctx.brand.emailVerified) {
      throw new TRPCError({ code: "FORBIDDEN", message: BRAND_NOT_VERIFIED_ERR_MSG });
    }
    return next({ ctx: { ...ctx, brand: ctx.brand } });
  }),
);
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test server/trpc.middleware.test.ts`
Expected: PASS (all middleware tests).

- [ ] **Step 5: Type-check**

Run: `pnpm check`
Expected: PASS for trpc.ts. (Other test files still use `role: "user"` — fixed in Task 8.)

- [ ] **Step 6: Commit**

```bash
git add server/_core/trpc.ts server/trpc.middleware.test.ts
git commit -m "feat(auth): verified/superAdmin/vendor procedures with tests"
```

---

## Task 8: Repair existing tests + localAuth role defaults

**Files:**
- Modify: `server/auth.logout.test.ts`
- Modify: `server/integrations.test.ts`
- Modify: `server/stores.test.ts`
- Modify: `server/_core/localAuth.ts`

- [ ] **Step 1: Fix `server/auth.logout.test.ts`**

In the user object (around lines 16–26), change:
```ts
    role: "user",
```
to:
```ts
    role: "consumer",
    emailVerified: true,
    emailVerifiedAt: new Date(),
```

- [ ] **Step 2: Fix `server/integrations.test.ts`**

Find `role: "user",` (around line 97). Replace with the same three lines as above.

- [ ] **Step 3: Fix `server/stores.test.ts`**

Find `role: "user",` (around line 70). Replace with the same three lines.

- [ ] **Step 4: Fix `server/_core/localAuth.ts`**

Find this line in `app.post("/api/auth/signup", ...)` (around line 90):
```ts
        role: ENV.ownerOpenId === openId ? "admin" : "user",
```

Replace with:
```ts
        role: ENV.ownerOpenId === openId ? "super_admin" : "consumer",
```

- [ ] **Step 5: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 6: Type-check**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/auth.logout.test.ts server/integrations.test.ts server/stores.test.ts server/_core/localAuth.ts
git commit -m "refactor(auth): align role literals with new enum (user→consumer, admin→super_admin)"
```

---

**🏁 Phase 1 complete.** App should boot. Behavior unchanged for end users. All tests green.

Optional integration smoke: run `pnpm dev`, sign in with the mock auth (if `MOCK_AUTH=true` env is set), confirm the dashboard loads. Then move on to Phase 2.

---

# PHASE 2 — Consumer auth UI

## Task 9: Wire signup to send verify email, and add forgot/reset/verify endpoints

**Files:**
- Modify: `server/_core/localAuth.ts`
- Create: `server/auth.signup-verify.test.ts`
- Create: `server/auth.password-reset.test.ts`

> **Test caveat:** `localAuth.ts` does its own `findByEmail` via a direct drizzle `getDb()` call (not via the `db` module helpers). The integration tests below mock the `./db` module — but they cannot intercept the raw drizzle calls inside `localAuth.ts`. As written, the mocked tests work for the verify/reset paths (which DO go through `db.consumeUserToken`, `db.markUserEmailVerified`, etc.), and for the no-enumeration assertion in forgot-password (which falls through to `getDb()` returning null when DATABASE_URL is unset → `findByEmail` returns null → 200). **They do not exercise the happy-path signup-success or forgot-password-success flows against a real INSERT/SELECT.** Cover those with manual smoke testing or extend `db.ts` later with `getUserByEmail` / `createUserViaLocal` helpers and refactor `localAuth.ts` to use them. That refactor is intentionally NOT in this plan — keep the surface small.

- [ ] **Step 1: Write the signup-verify integration test**

Create `server/auth.signup-verify.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => {
  const userTokenStore = new Map<string, any>();
  const users = new Map<number, any>();
  let nextId = 1;

  return {
    getUserById: vi.fn(async (id: number) => users.get(id) ?? null),
    upsertUser: vi.fn(async (u: any) => {
      const id = nextId++;
      users.set(id, { id, ...u, emailVerified: false });
      return id;
    }),
    createUserToken: vi.fn(async (data: any) => {
      userTokenStore.set(data.token, { ...data, usedAt: null });
    }),
    consumeUserToken: vi.fn(async (token: string, expectedType: string) => {
      const t = userTokenStore.get(token);
      if (!t || t.type !== expectedType || t.usedAt) return null;
      if (t.expiresAt.getTime() < Date.now()) return null;
      t.usedAt = new Date();
      return { userId: t.userId };
    }),
    invalidateUserTokensOfType: vi.fn(),
    markUserEmailVerified: vi.fn(async (userId: number) => {
      const u = users.get(userId);
      if (u) u.emailVerified = true;
    }),
    setUserPasswordHash: vi.fn(),
    __userStore: users,
    __tokenStore: userTokenStore,
  };
});

vi.mock("./services/userAuth", async () => {
  const actual = await vi.importActual<typeof import("./services/userAuth")>(
    "./services/userAuth",
  );
  return {
    ...actual,
    sendUserEmail: vi.fn(async () => ({ delivered: true })),
  };
});

// ... import after mocks
import express from "express";
import * as db from "./db";
import { registerLocalAuthRoutes } from "./_core/localAuth";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerLocalAuthRoutes(app);
  return app;
}

async function post(app: any, path: string, body: any) {
  // Minimal supertest replacement using node's fetch via http.createServer
  const http = await import("node:http");
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  } finally {
    server.close();
  }
}

describe("signup → verify flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signup creates a user with emailVerified=false and an email_verify token", async () => {
    const app = makeApp();
    const res = await post(app, "/api/auth/signup", {
      email: "new@example.com",
      password: "password123",
      name: "Newbie",
    });
    expect(res.status).toBe(200);
    expect(vi.mocked(db.createUserToken)).toHaveBeenCalledOnce();
    const tokenArg = vi.mocked(db.createUserToken).mock.calls[0][0];
    expect(tokenArg.type).toBe("email_verify");
    expect(tokenArg.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verify-email succeeds and flips emailVerified", async () => {
    const app = makeApp();
    await post(app, "/api/auth/signup", {
      email: "alice@example.com",
      password: "password123",
    });
    const tokenArg = vi.mocked(db.createUserToken).mock.calls[0][0];

    const verifyRes = await post(app, "/api/auth/verify-email", { token: tokenArg.token });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body).toEqual({ ok: true });
    expect(vi.mocked(db.markUserEmailVerified)).toHaveBeenCalledOnce();
  });

  it("verify-email rejects a re-used token", async () => {
    const app = makeApp();
    await post(app, "/api/auth/signup", {
      email: "bob@example.com",
      password: "password123",
    });
    const tokenArg = vi.mocked(db.createUserToken).mock.calls[0][0];

    await post(app, "/api/auth/verify-email", { token: tokenArg.token });
    const second = await post(app, "/api/auth/verify-email", { token: tokenArg.token });
    expect(second.status).toBe(400);
  });
});
```

- [ ] **Step 2: Write the password-reset integration test**

Create `server/auth.password-reset.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./db", () => {
  const tokenStore = new Map<string, any>();
  const users = new Map<number, any>();
  // Seed a known user
  users.set(42, {
    id: 42,
    email: "known@example.com",
    passwordHash: "old-hash",
    openId: "local:known@example.com",
    name: "Known",
    role: "consumer",
    emailVerified: true,
  });

  return {
    getUserById: vi.fn(async (id: number) => users.get(id) ?? null),
    upsertUser: vi.fn(),
    createUserToken: vi.fn(async (data: any) => {
      tokenStore.set(data.token, { ...data, usedAt: null });
    }),
    consumeUserToken: vi.fn(async (token: string, expectedType: string) => {
      const t = tokenStore.get(token);
      if (!t || t.type !== expectedType || t.usedAt) return null;
      if (t.expiresAt.getTime() < Date.now()) return null;
      t.usedAt = new Date();
      return { userId: t.userId };
    }),
    invalidateUserTokensOfType: vi.fn(),
    markUserEmailVerified: vi.fn(),
    setUserPasswordHash: vi.fn(async (userId: number, hash: string) => {
      const u = users.get(userId);
      if (u) u.passwordHash = hash;
    }),
    // Also stub the lookup-by-email used by /forgot-password
    __findByEmail: (email: string) => {
      for (const u of users.values()) if (u.email === email) return u;
      return null;
    },
    __userStore: users,
    __tokenStore: tokenStore,
  };
});

vi.mock("./services/userAuth", async () => {
  const actual = await vi.importActual<typeof import("./services/userAuth")>(
    "./services/userAuth",
  );
  return {
    ...actual,
    sendUserEmail: vi.fn(async () => ({ delivered: true })),
  };
});

// localAuth uses a direct drizzle query for findByEmail; stub getDb to return null
// so it falls through to a "not found" path — then we test the no-enumeration behavior.
// For the success path we'll wire findByEmail via a mock seam (see Task 9 step 3).

import express from "express";
import * as db from "./db";
import { registerLocalAuthRoutes } from "./_core/localAuth";

function makeApp() {
  const app = express();
  app.use(express.json());
  registerLocalAuthRoutes(app);
  return app;
}

async function post(app: any, path: string, body: any) {
  const http = await import("node:http");
  const server = http.createServer(app);
  await new Promise<void>(r => server.listen(0, r));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : 0;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  } finally {
    server.close();
  }
}

describe("forgot-password / reset-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forgot-password returns 200 for unknown email (no enumeration)", async () => {
    const app = makeApp();
    const res = await post(app, "/api/auth/forgot-password", { email: "ghost@nowhere" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("reset-password fails for unknown token", async () => {
    const app = makeApp();
    const res = await post(app, "/api/auth/reset-password", {
      token: "deadbeef".repeat(8),
      newPassword: "newpassword123",
    });
    expect(res.status).toBe(400);
  });
});
```

Note: testing the **happy path** for password-reset requires hitting the real DB findByEmail seam — covered manually during smoke testing. The unit test above covers the security-critical paths (no enumeration, bad token rejection).

- [ ] **Step 3: Run the tests (expected to fail)**

Run: `pnpm test server/auth.signup-verify.test.ts server/auth.password-reset.test.ts`
Expected: FAIL (endpoints don't exist yet).

- [ ] **Step 4: Refactor + extend `server/_core/localAuth.ts`**

Replace the contents with:

```ts
import type { Express, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { and, eq, gte, isNull } from "drizzle-orm";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";
import { getDb } from "../db";
import * as db from "../db";
import { users, userTokens } from "../../drizzle/schema";
import { ENV } from "./env";
import {
  buildUserActionUrl,
  generateUserToken,
  sendUserEmail,
  userTokenExpiry,
  USER_RESEND_COOLDOWN_MS,
} from "../services/userAuth";

const credentialsSchema = z.object({
  email: z.string().email("Email inválido").max(320),
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres")
    .max(200),
  name: z.string().min(1).max(120).optional(),
});

const tokenInputSchema = z.object({
  token: z.string().min(16).max(256),
});

const resetInputSchema = z.object({
  token: z.string().min(16).max(256),
  newPassword: z.string().min(8).max(200),
});

const emailOnlySchema = z.object({
  email: z.string().email().max(320),
});

const BCRYPT_ROUNDS = 12;
const lastResendAt = new Map<number, number>();

function openIdForEmail(email: string): string {
  return `local:${email.toLowerCase()}`;
}

async function findByEmail(email: string) {
  const d = await getDb();
  if (!d) return null;
  const rows = await d
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

async function issueSession(req: Request, res: Response, openId: string, name: string) {
  const token = await sdk.createSessionToken(openId, {
    name,
    expiresInMs: ONE_YEAR_MS,
  });
  const cookieOptions = getSessionCookieOptions(req);
  res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS });
}

function badRequest(res: Response, message: string, code = 400) {
  res.status(code).json({ error: message });
}

async function sendVerificationEmail(userId: number, email: string, name: string) {
  await db.invalidateUserTokensOfType(userId, "email_verify");
  const token = generateUserToken();
  await db.createUserToken({
    userId,
    token,
    type: "email_verify",
    expiresAt: userTokenExpiry("email_verify"),
  });
  const url = buildUserActionUrl(ENV.appBaseUrl, "verify-email", token);
  await sendUserEmail({
    to: email,
    subject: "Verificá tu correo en Tulistica",
    body: `Hola ${name},\n\nConfirmá tu correo abriendo este enlace:\n${url}\n\nEl enlace vence en 24 horas.`,
  });
}

export function registerLocalAuthRoutes(app: Express) {
  // ===== SIGN UP =====
  app.post("/api/auth/signup", async (req, res) => {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, parsed.error.issues[0]?.message ?? "Datos inválidos");
    }

    const d = await getDb();
    if (!d) return badRequest(res, "Servicio no disponible", 503);

    const email = parsed.data.email.toLowerCase();
    const existing = await findByEmail(email);
    if (existing && existing.passwordHash) {
      return badRequest(res, "Ese correo ya está registrado", 409);
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, BCRYPT_ROUNDS);
    const name = parsed.data.name?.trim() || email.split("@")[0];
    const openId = openIdForEmail(email);

    let userId: number | null = null;
    if (existing) {
      await d
        .update(users)
        .set({
          passwordHash,
          name,
          loginMethod: "local",
          lastSignedIn: new Date(),
        })
        .where(eq(users.id, existing.id));
      userId = existing.id;
    } else {
      const result = await d.insert(users).values({
        openId,
        email,
        name,
        passwordHash,
        loginMethod: "local",
        lastSignedIn: new Date(),
        role: ENV.ownerOpenId === openId ? "super_admin" : "consumer",
        emailVerified: false,
      });
      userId = (result as any)[0]?.insertId ?? null;
    }

    if (userId) {
      try {
        await sendVerificationEmail(userId, email, name);
      } catch (err) {
        console.warn("[Auth] signup verify-email send failed", err);
      }
    }

    await issueSession(req, res, openId, name);
    res.json({ ok: true });
  });

  // ===== SIGN IN =====
  app.post("/api/auth/signin", async (req, res) => {
    const parsed = credentialsSchema
      .pick({ email: true, password: true })
      .safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, parsed.error.issues[0]?.message ?? "Datos inválidos");
    }

    const user = await findByEmail(parsed.data.email);
    if (!user || !user.passwordHash) {
      return badRequest(res, "Credenciales inválidas", 401);
    }

    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) return badRequest(res, "Credenciales inválidas", 401);

    const d = await getDb();
    if (d) {
      await d.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));
    }

    await issueSession(req, res, user.openId, user.name ?? user.email ?? "Usuario");
    res.json({ ok: true });
  });

  // ===== VERIFY EMAIL =====
  app.post("/api/auth/verify-email", async (req, res) => {
    const parsed = tokenInputSchema.safeParse(req.body);
    if (!parsed.success) return badRequest(res, "Token inválido");
    const consumed = await db.consumeUserToken(parsed.data.token, "email_verify");
    if (!consumed) return badRequest(res, "Token inválido o expirado");
    await db.markUserEmailVerified(consumed.userId);
    res.json({ ok: true });
  });

  // ===== RESEND VERIFICATION =====
  app.post("/api/auth/resend-verification", async (req, res) => {
    // Requires session — use sdk to authenticate
    let user;
    try {
      user = await sdk.authenticateRequest(req);
    } catch {
      user = null;
    }
    if (!user) return badRequest(res, "No autorizado", 401);
    if (user.emailVerified) return res.json({ ok: true, alreadyVerified: true });

    const last = lastResendAt.get(user.id) ?? 0;
    if (Date.now() - last < USER_RESEND_COOLDOWN_MS) {
      return badRequest(res, "Esperá unos segundos antes de pedir otro correo", 429);
    }
    lastResendAt.set(user.id, Date.now());

    await sendVerificationEmail(user.id, user.email ?? "", user.name ?? "Usuario");
    res.json({ ok: true });
  });

  // ===== FORGOT PASSWORD =====
  app.post("/api/auth/forgot-password", async (req, res) => {
    const parsed = emailOnlySchema.safeParse(req.body);
    if (!parsed.success) {
      // Still 200 — do not leak parse errors
      return res.json({ ok: true });
    }
    const user = await findByEmail(parsed.data.email);
    if (!user || !user.passwordHash) {
      // No enumeration: always return 200.
      return res.json({ ok: true });
    }
    await db.invalidateUserTokensOfType(user.id, "password_reset");
    const token = generateUserToken();
    await db.createUserToken({
      userId: user.id,
      token,
      type: "password_reset",
      expiresAt: userTokenExpiry("password_reset"),
    });
    const url = buildUserActionUrl(ENV.appBaseUrl, "reset-password", token);
    await sendUserEmail({
      to: user.email ?? parsed.data.email,
      subject: "Restablecé tu contraseña en Tulistica",
      body: `Abrí este enlace (válido 30 minutos):\n${url}`,
    });
    res.json({ ok: true });
  });

  // ===== RESET PASSWORD =====
  app.post("/api/auth/reset-password", async (req, res) => {
    const parsed = resetInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return badRequest(res, "Datos inválidos");
    }
    const consumed = await db.consumeUserToken(parsed.data.token, "password_reset");
    if (!consumed) return badRequest(res, "Token inválido o expirado");
    const hash = await bcrypt.hash(parsed.data.newPassword, BCRYPT_ROUNDS);
    await db.setUserPasswordHash(consumed.userId, hash);
    res.json({ ok: true });
  });
}
```

Note the `ENV.appBaseUrl` reference — verify it exists in `server/_core/env.ts`. If not (search for `appBaseUrl`), add a fallback:

```ts
const url = buildUserActionUrl(ENV.appBaseUrl ?? "http://localhost:3000", "verify-email", token);
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test server/auth.signup-verify.test.ts server/auth.password-reset.test.ts`
Expected: PASS for all listed cases.

- [ ] **Step 6: Type-check**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add server/_core/localAuth.ts server/auth.signup-verify.test.ts server/auth.password-reset.test.ts
git commit -m "feat(auth): verify-email, resend, forgot-password, reset-password endpoints"
```

---

## Task 10: Build the new SignIn page (replaces SignIn.tsx + Login.tsx)

**Files:**
- Delete: `client/src/pages/SignIn.tsx` (the existing stale one) then re-create at the same path
- Delete: `client/src/pages/Login.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Delete the two old pages**

```bash
rm client/src/pages/SignIn.tsx
rm client/src/pages/Login.tsx
```

- [ ] **Step 2: Create the new `client/src/pages/SignIn.tsx`**

```tsx
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, Receipt } from "lucide-react";
import { getLoginUrl } from "@/const";

type Mode = "signin" | "signup";

export default function SignIn() {
  const [mode, setMode] = useState<Mode>("signin");
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [, navigate] = useLocation();

  const oauthConfigured =
    Boolean(import.meta.env.VITE_OAUTH_PORTAL_URL) &&
    Boolean(import.meta.env.VITE_APP_ID);
  const oauthHref = getLoginUrl();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const endpoint = mode === "signin" ? "/api/auth/signin" : "/api/auth/signup";
      const body = mode === "signup"
        ? { email, password, name: name || undefined }
        : { email, password };
      const res = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Error desconocido" }));
        throw new Error(data.error ?? `Error ${res.status}`);
      }
      window.location.href = "/dashboard";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al iniciar sesión");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon" aria-label="Volver al inicio">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <Link href="/" className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-full bg-primary/15 text-primary grid place-items-center">
              <Receipt className="w-5 h-5" />
            </span>
            <span className="font-serif text-lg">tulistica</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="font-serif text-3xl">
              {mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
            </CardTitle>
            <CardDescription>
              {mode === "signin"
                ? "Ingresá para acceder a tus listas, alertas y reportes."
                : "Creá una cuenta para guardar listas y reportar precios."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {oauthConfigured && (
              <>
                <a href={oauthHref} className="block mb-4">
                  <Button size="lg" className="w-full rounded-full">
                    Continuar con Tulistica
                    <ArrowRight className="ml-1 h-4 w-4" />
                  </Button>
                </a>
                <div className="relative my-6 text-center text-xs uppercase tracking-widest text-muted-foreground">
                  <span className="bg-card px-3 relative z-10">o usá tu correo</span>
                  <span className="absolute inset-x-0 top-1/2 border-t" />
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="name">Nombre (opcional)</Label>
                  <Input
                    id="name"
                    type="text"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Cómo te llamamos"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tu@correo.cr"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Contraseña</Label>
                  {mode === "signin" && (
                    <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                      ¿Olvidaste tu contraseña?
                    </Link>
                  )}
                </div>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Procesando..." : mode === "signin" ? "Iniciar sesión" : "Crear cuenta"}
              </Button>
            </form>

            <div className="mt-6 text-center text-sm text-muted-foreground">
              {mode === "signin" ? (
                <>
                  ¿No tenés cuenta?{" "}
                  <button type="button" className="text-primary hover:underline" onClick={() => setMode("signup")}>
                    Crear cuenta
                  </button>
                </>
              ) : (
                <>
                  ¿Ya tenés cuenta?{" "}
                  <button type="button" className="text-primary hover:underline" onClick={() => setMode("signin")}>
                    Iniciar sesión
                  </button>
                </>
              )}
            </div>

            <div className="mt-4 text-center text-xs text-muted-foreground">
              Al continuar aceptás los{" "}
              <Link href="/legal/terms" className="underline">Términos</Link>{" "}y la{" "}
              <Link href="/legal/privacy" className="underline">Política de Privacidad</Link>.
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Update `client/src/App.tsx`**

Find the existing route:
```tsx
import Login from "./pages/Login";
...
<Route path="/login" component={Login} />
```

Replace the import with:
```tsx
import SignIn from "./pages/SignIn";
import { Redirect } from "wouter";
```

Replace `<Route path="/login" ... />` with:
```tsx
<Route path="/sign-in" component={SignIn} />
<Route path="/login">
  <Redirect to="/sign-in" />
</Route>
```

If `Redirect` is not exported by your wouter version, use a small inline component:
```tsx
function RedirectTo({ to }: { to: string }) {
  const [, navigate] = useLocation();
  useEffect(() => { navigate(to, { replace: true }); }, [navigate, to]);
  return null;
}
```

and use `<RedirectTo to="/sign-in" />` instead.

- [ ] **Step 4: Type-check + dev smoke**

Run: `pnpm check`
Expected: PASS.

If you have a dev environment available, run `pnpm dev`, open `/sign-in`, switch between signin/signup tabs, verify both submit calls work. Open `/login` and confirm it redirects to `/sign-in`.

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/SignIn.tsx client/src/App.tsx
git rm client/src/pages/Login.tsx 2>/dev/null || true
git commit -m "feat(auth): single canonical /sign-in page with OAuth + email/password"
```

---

## Task 11: ForgotPassword + ResetPassword + VerifyEmail pages

**Files:**
- Create: `client/src/pages/ForgotPassword.tsx`
- Create: `client/src/pages/ResetPassword.tsx`
- Create: `client/src/pages/VerifyEmail.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `client/src/pages/ForgotPassword.tsx`**

```tsx
import { useState } from "react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Receipt } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error("Error desconocido");
      setSent(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/sign-in">
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
            <CardTitle className="font-serif text-2xl">Restablecer contraseña</CardTitle>
            <CardDescription>
              {sent
                ? "Si la cuenta existe, te enviamos un correo con el enlace para reiniciar."
                : "Ingresá tu correo y te mandamos un enlace."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!sent ? (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Correo electrónico</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@correo.cr"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? "Enviando..." : "Enviar enlace"}
                </Button>
              </form>
            ) : (
              <Link href="/sign-in">
                <Button variant="outline" className="w-full">Volver a iniciar sesión</Button>
              </Link>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Create `client/src/pages/ResetPassword.tsx`**

```tsx
import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Receipt } from "lucide-react";

export default function ResetPassword() {
  const [, navigate] = useLocation();
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Token inválido o expirado");
      }
      toast.success("Contraseña actualizada. Iniciá sesión de nuevo.");
      navigate("/sign-in");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <main className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Enlace inválido</CardTitle>
            <CardDescription>El enlace no tiene un token válido.</CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/forgot-password">
              <Button>Pedir un nuevo enlace</Button>
            </Link>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="container flex h-16 items-center gap-4">
          <Link href="/sign-in">
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
            <CardTitle className="font-serif text-2xl">Nueva contraseña</CardTitle>
            <CardDescription>Elegí una nueva contraseña para tu cuenta.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirmar</Label>
                <Input
                  id="confirm"
                  type="password"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Guardando..." : "Guardar contraseña"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Create `client/src/pages/VerifyEmail.tsx`**

```tsx
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2, Receipt } from "lucide-react";

type State = "verifying" | "success" | "error";

export default function VerifyEmail() {
  const [, navigate] = useLocation();
  const token = useMemo(() => new URLSearchParams(window.location.search).get("token") ?? "", []);
  const [state, setState] = useState<State>("verifying");

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-email", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        setState(res.ok ? "success" : "error");
      } catch {
        setState("error");
      }
    })();
  }, [token]);

  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="flex items-center gap-2 mb-3 text-primary">
            <Receipt className="w-5 h-5" />
            <span className="font-serif text-lg">tulistica</span>
          </div>
          <CardTitle className="font-serif text-2xl">
            {state === "verifying" && "Verificando…"}
            {state === "success" && "¡Correo verificado!"}
            {state === "error" && "Enlace inválido o vencido"}
          </CardTitle>
          <CardDescription>
            {state === "success" && "Ya podés reportar precios y compartir listas."}
            {state === "error" && "Pedí un nuevo correo de verificación desde tu perfil."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center py-6">
            {state === "verifying" && <Loader2 className="w-10 h-10 animate-spin text-muted-foreground" />}
            {state === "success" && <CheckCircle2 className="w-10 h-10 text-primary" />}
            {state === "error" && <XCircle className="w-10 h-10 text-destructive" />}
          </div>
          {state === "success" && (
            <Button className="w-full" onClick={() => navigate("/dashboard")}>
              Ir al dashboard
            </Button>
          )}
          {state === "error" && (
            <Link href="/dashboard">
              <Button variant="outline" className="w-full">Volver al dashboard</Button>
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
```

- [ ] **Step 4: Wire routes in `client/src/App.tsx`**

Add imports:
```tsx
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import VerifyEmail from "./pages/VerifyEmail";
```

Add routes (place after the `/sign-in` route added in Task 10):
```tsx
<Route path="/forgot-password" component={ForgotPassword} />
<Route path="/reset-password" component={ResetPassword} />
<Route path="/verify-email" component={VerifyEmail} />
```

- [ ] **Step 5: Type-check**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add client/src/pages/ForgotPassword.tsx client/src/pages/ResetPassword.tsx client/src/pages/VerifyEmail.tsx client/src/App.tsx
git commit -m "feat(auth): forgot/reset/verify pages with full UX"
```

---

## Task 12: Verify-email banner on dashboard

**Files:**
- Create: `client/src/components/VerifyEmailBanner.tsx`
- Modify: `client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Create the banner**

```tsx
// client/src/components/VerifyEmailBanner.tsx
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Mail, X } from "lucide-react";
import { toast } from "sonner";

interface VerifyEmailBannerProps {
  emailVerified: boolean;
}

export function VerifyEmailBanner({ emailVerified }: VerifyEmailBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  if (emailVerified || dismissed) return null;

  const handleResend = async () => {
    setSending(true);
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
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="border-b bg-amber-50 dark:bg-amber-950/30">
      <div className="container flex items-center gap-3 py-3 text-sm">
        <Mail className="w-4 h-4 shrink-0 text-amber-700 dark:text-amber-300" />
        <span className="flex-1">
          Verificá tu correo para reportar precios y compartir listas.
        </span>
        <Button size="sm" variant="outline" onClick={handleResend} disabled={sending}>
          {sending ? "Enviando..." : "Reenviar correo"}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar aviso"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
```

Note: this uses `fetch` directly rather than tRPC for `resend-verification` because the endpoint is an Express route, not a tRPC procedure. Consistent with how SignIn.tsx already calls `/api/auth/*`.

- [ ] **Step 2: Mount the banner in Dashboard**

Open `client/src/pages/Dashboard.tsx`. Find the top of the rendered tree (the outermost `<div>` after the loading guard). Import:
```tsx
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
```

Then assuming you have a `user` from `trpc.auth.me.useQuery()` (or equivalent), render the banner near the top:
```tsx
<VerifyEmailBanner emailVerified={user?.emailVerified ?? true} />
```

> If you can't find a quick user-source in Dashboard, search the codebase for `auth.me` to see how the dashboard reads the current user. Adapt the prop accordingly.

- [ ] **Step 3: Type-check + dev smoke**

Run: `pnpm check`
Expected: PASS.

If dev env available: sign up as a fresh user, confirm banner appears, click "Reenviar correo", confirm toast.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/VerifyEmailBanner.tsx client/src/pages/Dashboard.tsx
git commit -m "feat(auth): verify-email banner on dashboard with resend action"
```

---

## Task 13: Gate write procedures behind verifiedProcedure

**Files:**
- Modify: `server/routers.ts`

- [ ] **Step 1: Import verifiedProcedure**

Open `server/routers.ts`. Find the import line for `protectedProcedure` (around line 6). Add `verifiedProcedure` to the same import:

```ts
import {
  adminProcedure,
  protectedProcedure,
  publicProcedure,
  router,
  verifiedProcedure,
} from "./_core/trpc";
```

- [ ] **Step 2: Switch the targeted write procedures**

For each of these lines, change `protectedProcedure` → `verifiedProcedure`:

| Route | Line (approx) | Reason |
|---|---|---|
| `prices.submit` | 553 | Community price entry |
| `prices.vote` | 638 | Community vote |
| `lists.create` | 711 | Creates shared content |
| `lists.update` | 726 | Edits shared list |
| `lists.delete` | 746 | Mutates shared list |
| `lists.joinByCode` | 753 | Joins shared list |
| `lists.addItem` | 763 | Writes list item |
| `lists.updateItem` | 796 | Writes list item |
| `lists.checkItem` | 810 | Writes list item |
| `lists.removeItem` | 820 | Writes list item |
| `pantry.add` | 838 | (Personal data — see note) |
| `pantry.update` | 856 | (Personal data — see note) |
| `pantry.recordPurchase` | 870 | (Personal data — see note) |
| `recipes.save` | 153 | Personal data — see note |
| `recipes.delete` | 176 | Personal data — see note |

**Personal-data note:** the spec says "writes" are gated, but Pantry/Recipes are personal data not community data. **Skip switching them** — leave as `protectedProcedure`. Only switch the items in the table above whose "Reason" mentions community/shared content (`prices.*`, `lists.*`).

The final set to switch is:
- `prices.submit`
- `prices.vote`
- `lists.create`, `lists.update`, `lists.delete`, `lists.joinByCode`, `lists.addItem`, `lists.updateItem`, `lists.checkItem`, `lists.removeItem`

Additionally search the file for any `crowdedness.report` / `crowdedness.submit` / `alerts.create` mutation — if found, switch those too (community-visible).

- [ ] **Step 3: Type-check**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: PASS. If any test breaks because it was calling one of the now-gated procedures with `emailVerified: false`, set `emailVerified: true` in that test's mock user.

- [ ] **Step 5: Dev smoke**

Optional: with a fresh unverified account, try `prices.submit` from the UI and confirm the server rejects with the verify message.

- [ ] **Step 6: Commit**

```bash
git add server/routers.ts
git commit -m "feat(auth): require email verification for community writes (prices/lists)"
```

---

## Task 14: Update the existing brand portal email subject for consistency (small touch-up)

**Files:**
- Modify: `server/services/brandAuth.ts` (single string)

- [ ] **Step 1: Replace the email subject prefix**

In `server/services/brandAuth.ts`, find:
```ts
    title: `[Grocery Waze] ${opts.subject}`,
```

Replace with:
```ts
    title: `[Tulistica] ${opts.subject}`,
```

- [ ] **Step 2: Commit**

```bash
git add server/services/brandAuth.ts
git commit -m "chore: rebrand brand email subject to Tulistica"
```

---

# Known deferrals

The source spec (§9) calls for a Playwright E2E test that walks signup → verify → write → forgot → reset. The project does not currently have a Playwright E2E harness wired up (`playwright` is a dependency only because the scraper uses it; there is no `playwright.config.ts` and no E2E test directory). **Setting up the E2E harness is intentionally outside this plan's scope** — it's its own infrastructure task. The Vitest integration tests in Tasks 4, 7, and 9 cover the security-critical paths. Manual smoke-test the happy path during PR review.

If you decide to do the E2E setup as a follow-on, the test journey to script is documented in [the spec](../specs/2026-05-25-auth-and-role-model-design.md#9-testing).

---

# Final verification

- [ ] **Step 1: Run the full test suite one more time**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 2: Final type-check**

Run: `pnpm check`
Expected: PASS.

- [ ] **Step 3: Production build**

Run: `pnpm build`
Expected: succeeds.

- [ ] **Step 4: Push the branch and open a PR**

```bash
git push -u origin claude/bold-allen-a3a0bb
gh pr create --title "feat(auth): role unification + consumer verify/reset (Phase 1+2)" --body "$(cat <<'EOF'
## Summary
- Phase 1: expanded role enum (consumer/vendor_staff/vendor_admin/super_admin), added \`brand_members\` join + \`stores.brandId\`, \`brands.kind\` discriminator, fixed phantom-columns mock-context bug, added \`verifiedProcedure\` / \`superAdminProcedure\` / \`vendorStaffProcedure\` / \`vendorAdminProcedure\`.
- Phase 2: single canonical \`/sign-in\` page (deletes the stale Grocery Waze page), forgot/reset/verify-email pages + endpoints, resend-verification with 60s cooldown, dashboard banner, community-write actions now require email verification.

Phase 3 (brand-cookie deprecation) is a separate follow-on spec.

See: docs/superpowers/specs/2026-05-25-auth-and-role-model-design.md
See: docs/superpowers/plans/2026-05-25-auth-and-role-model-plan.md

## Test plan
- [ ] \`pnpm test\` green
- [ ] \`pnpm check\` green
- [ ] \`pnpm build\` green
- [ ] Manual: signup → see verify banner → write blocked → click verify link → banner clears, write works
- [ ] Manual: forgot password → reset → sign in with new password
- [ ] Manual: \`/login\` redirects to \`/sign-in\`
- [ ] Manual: super_admin (dev MOCK_AUTH) can access \`/admin\`
EOF
)"
```

(Adjust the `gh pr create` command if your team has different conventions. The user should review before pushing.)
