# Store Claiming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the vendor store-claim flow: vendor admins search for and request ownership of stores, super-admin approves or rejects, approved claims set `stores.brandId`.

**Architecture:** New `store_claims` table tracks claim state. tRPC `storeClaims` sub-router exposes `search` / `claim` / `myClaims` / `myStores` (vendor-side) and `listPending` / `approve` / `reject` (admin-side). Approval is race-protected: re-fetches the store and fails if already claimed. Two new vendor pages plus a tab on the existing admin queue.

**Tech Stack:** Same as prior phases — TypeScript, React 19 + Vite, Wouter, tRPC v11, Drizzle ORM, MySQL 8, Vitest.

**Source spec:** [docs/superpowers/specs/2026-05-25-store-claiming-design.md](../specs/2026-05-25-store-claiming-design.md)

---

## File map

| Path | Action | Notes |
|---|---|---|
| `drizzle/0012_store_claims.sql` | **create** | one migration |
| `drizzle/schema.ts` | modify | append `storeClaims` table + types |
| `server/db.ts` | modify | add 8 helpers (`getStoreById` already exists) |
| `server/routers.ts` | modify | add `storeClaims` sub-router |
| `server/store-claims.test.ts` | **create** | vitest coverage |
| `client/src/pages/brand/BrandStores.tsx` | **create** | "Mis tiendas" — my stores + my claims |
| `client/src/pages/brand/BrandStoresClaim.tsx` | **create** | search + claim dialog |
| `client/src/pages/admin/AdminVendorQueue.tsx` | modify | tabbed queue (vendor apps + store claims) |
| `client/src/App.tsx` | modify | two new routes under `/brand/stores*` |
| `client/src/components/BrandLayout.tsx` | modify | add "Stores" nav item |

---

## Task 1: Migration 0012 + schema

**Files:**
- Create: `drizzle/0012_store_claims.sql`
- Modify: `drizzle/schema.ts`

**Strict file scope**: ONLY these two files. Before commit, run `git status` and confirm exactly 2 files staged.

- [ ] **Step 1: Create the migration**

Create `drizzle/0012_store_claims.sql` with exactly:

```sql
-- 0012_store_claims.sql
-- Vendor store-ownership claim workflow. Approval sets stores.brandId.

CREATE TABLE store_claims (
  id INT AUTO_INCREMENT PRIMARY KEY,
  brandId INT NOT NULL,
  storeId INT NOT NULL,
  claimantUserId INT NOT NULL,
  justification TEXT,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewerNote TEXT,
  reviewedByUserId INT,
  reviewedAt TIMESTAMP NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_store_claims_brand (brandId),
  INDEX idx_store_claims_store (storeId),
  INDEX idx_store_claims_status (status)
);
```

- [ ] **Step 2: Append schema entry**

Open `drizzle/schema.ts`. At the very bottom (after `vendorApplications`), append:

```ts
// ============ STORE CLAIMS ============
export const storeClaims = mysqlTable("store_claims", {
  id: int("id").autoincrement().primaryKey(),
  brandId: int("brandId").notNull(),
  storeId: int("storeId").notNull(),
  claimantUserId: int("claimantUserId").notNull(),
  justification: text("justification"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewerNote: text("reviewerNote"),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: timestamp("reviewedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_store_claims_brand").on(table.brandId),
  index("idx_store_claims_store").on(table.storeId),
  index("idx_store_claims_status").on(table.status),
]);

export type StoreClaim = typeof storeClaims.$inferSelect;
export type InsertStoreClaim = typeof storeClaims.$inferInsert;
```

All symbols (`mysqlTable`, `int`, `text`, `mysqlEnum`, `timestamp`, `index`) are already imported at the top.

- [ ] **Step 3: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean.

- [ ] **Step 4: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add drizzle/0012_store_claims.sql drizzle/schema.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb status
# confirm exactly 2 files staged
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(db): migration 0012 + storeClaims schema"
```

---

## Task 2: db.ts helpers

**Files:**
- Modify: `server/db.ts`

**Strict file scope**: ONLY `server/db.ts`. Confirm via `git status` before commit.

- [ ] **Step 1: Update top-of-file schema imports**

Find the existing `import { ... } from "../drizzle/schema"` block. Add `storeClaims` to it. Add `StoreClaim` and `InsertStoreClaim` to the existing `import type { ... }` block from the same module.

Note that `Store` is already imported (it's used by `getStoreById` at line ~218). `stores` table import already exists too.

- [ ] **Step 2: Confirm `like` is imported from drizzle-orm**

Search for `like` in the existing drizzle-orm import at the top:
```
grep -n 'from "drizzle-orm"' server/db.ts
```

If `like` isn't there, add it to the existing import. We use it for store name search.

- [ ] **Step 3: Append helpers at the bottom of `server/db.ts`**

```ts
// ============ STORE CLAIM HELPERS ============

export async function createStoreClaim(data: InsertStoreClaim): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(storeClaims).values(data);
  return (result as any)[0]?.insertId ?? null;
}

export async function getPendingClaimForBrandStore(
  brandId: number,
  storeId: number,
): Promise<StoreClaim | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(storeClaims)
    .where(and(
      eq(storeClaims.brandId, brandId),
      eq(storeClaims.storeId, storeId),
      eq(storeClaims.status, "pending"),
    ))
    .limit(1);
  return rows[0];
}

export async function getStoreClaimById(id: number): Promise<StoreClaim | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(storeClaims)
    .where(eq(storeClaims.id, id))
    .limit(1);
  return rows[0];
}

export type PendingStoreClaim = StoreClaim & { brand: Brand; store: Store };

export async function listPendingStoreClaims(): Promise<PendingStoreClaim[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      claim: storeClaims,
      brand: brands,
      store: stores,
    })
    .from(storeClaims)
    .innerJoin(brands, eq(storeClaims.brandId, brands.id))
    .innerJoin(stores, eq(storeClaims.storeId, stores.id))
    .where(eq(storeClaims.status, "pending"))
    .orderBy(desc(storeClaims.createdAt));
  return rows.map(r => ({ ...r.claim, brand: r.brand, store: r.store }));
}

export type BrandStoreClaim = StoreClaim & { store: Store };

export async function listStoreClaimsForBrand(brandId: number): Promise<BrandStoreClaim[]> {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select({
      claim: storeClaims,
      store: stores,
    })
    .from(storeClaims)
    .innerJoin(stores, eq(storeClaims.storeId, stores.id))
    .where(eq(storeClaims.brandId, brandId))
    .orderBy(desc(storeClaims.createdAt));
  return rows.map(r => ({ ...r.claim, store: r.store }));
}

export async function listStoresForBrand(brandId: number): Promise<Store[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(stores)
    .where(eq(stores.brandId, brandId))
    .orderBy(stores.name);
}

export async function searchUnclaimedStores(opts: {
  query?: string;
  city?: string;
  limit?: number;
}): Promise<Store[]> {
  const db = await getDb();
  if (!db) return [];
  const limit = opts.limit ?? 50;
  const conds = [isNull(stores.brandId)];
  if (opts.query) conds.push(like(stores.name, `%${opts.query}%`));
  if (opts.city) conds.push(like(stores.city, `%${opts.city}%`));
  return db
    .select()
    .from(stores)
    .where(and(...conds))
    .orderBy(stores.name)
    .limit(limit);
}

export async function markStoreClaimDecided(opts: {
  id: number;
  status: "approved" | "rejected";
  reviewerNote?: string;
  reviewedByUserId: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(storeClaims)
    .set({
      status: opts.status,
      reviewerNote: opts.reviewerNote ?? null,
      reviewedByUserId: opts.reviewedByUserId,
      reviewedAt: new Date(),
    })
    .where(eq(storeClaims.id, opts.id));
}

export async function linkStoreToBrand(storeId: number, brandId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(stores)
    .set({ brandId })
    .where(eq(stores.id, storeId));
}
```

`getStoreById` already exists at line ~218. Do NOT add a duplicate.

- [ ] **Step 4: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean.

- [ ] **Step 5: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add server/db.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb status
# confirm exactly 1 file staged
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(db): store-claim helpers + unclaimed-store search"
```

---

## Task 3: tRPC router + tests (TDD)

**Files:**
- Modify: `server/routers.ts`
- Create: `server/store-claims.test.ts`

**Strict file scope**: ONLY these two files. Confirm via `git status` before commit.

- [ ] **Step 1: Write the failing tests**

Create `server/store-claims.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Brand, Store, StoreClaim, User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getUserById: vi.fn(),
  getStoreById: vi.fn(),
  searchUnclaimedStores: vi.fn(),
  createStoreClaim: vi.fn(),
  getPendingClaimForBrandStore: vi.fn(),
  getStoreClaimById: vi.fn(),
  listPendingStoreClaims: vi.fn(),
  listStoreClaimsForBrand: vi.fn(),
  listStoresForBrand: vi.fn(),
  markStoreClaimDecided: vi.fn(),
  linkStoreToBrand: vi.fn(),
  getVendorMembershipsForUser: vi.fn(),
  getAdvertiserMembershipsForUser: vi.fn(),
  getAllMembershipsForUser: vi.fn(),
  upsertUser: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async () => undefined),
}));

vi.mock("./services/userAuth", async () => {
  const actual = await vi.importActual<typeof import("./services/userAuth")>("./services/userAuth");
  return { ...actual, sendUserEmail: vi.fn(async () => ({ delivered: true })) };
});

import * as db from "./db";
import { appRouter } from "./routers";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "u1",
    name: "User",
    email: "user@example.com",
    passwordHash: null,
    role: "vendor_admin",
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
    id: 50,
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
    kind: "vendor",
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

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 200,
    name: "Walmart Liberia",
    chainId: "walmart",
    address: "Liberia, Guanacaste",
    city: "Liberia",
    state: null,
    zipCode: null,
    latitude: 10.633,
    longitude: -85.437,
    phone: null,
    hours: null,
    imageUrl: null,
    avgRating: 0,
    totalRatings: 0,
    isActive: true,
    brandId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeClaim(overrides: Partial<StoreClaim> = {}): StoreClaim {
  return {
    id: 11,
    brandId: 50,
    storeId: 200,
    claimantUserId: 1,
    justification: null,
    status: "pending",
    reviewerNote: null,
    reviewedByUserId: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(user: User | null, brand: Brand | null = null): TrpcContext {
  return {
    user,
    brand,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("storeClaims.claim", () => {
  beforeEach(() => {
    vi.mocked(db.getVendorMembershipsForUser).mockReset();
    vi.mocked(db.getStoreById).mockReset();
    vi.mocked(db.getPendingClaimForBrandStore).mockReset();
    vi.mocked(db.createStoreClaim).mockReset();
  });

  it("rejects vendor_staff (vendorAdminProcedure)", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "staff" },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand()));
    await expect(caller.storeClaims.claim({ storeId: 200 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects when no active brand on ctx", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "owner" },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser(), null));
    await expect(caller.storeClaims.claim({ storeId: 200 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects when store doesn't exist", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "owner" },
    ]);
    vi.mocked(db.getStoreById).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand()));
    await expect(caller.storeClaims.claim({ storeId: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects when store is already claimed", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "owner" },
    ]);
    vi.mocked(db.getStoreById).mockResolvedValue(makeStore({ brandId: 999 }));
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand()));
    await expect(caller.storeClaims.claim({ storeId: 200 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("rejects when brand has a pending claim for the same store", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "owner" },
    ]);
    vi.mocked(db.getStoreById).mockResolvedValue(makeStore({ brandId: null }));
    vi.mocked(db.getPendingClaimForBrandStore).mockResolvedValue(makeClaim());
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand()));
    await expect(caller.storeClaims.claim({ storeId: 200 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("creates claim on happy path", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "owner" },
    ]);
    vi.mocked(db.getStoreById).mockResolvedValue(makeStore({ brandId: null }));
    vi.mocked(db.getPendingClaimForBrandStore).mockResolvedValue(undefined);
    vi.mocked(db.createStoreClaim).mockResolvedValue(77);
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand({ id: 50 })));
    const result = await caller.storeClaims.claim({
      storeId: 200,
      justification: "I own this Walmart",
    });
    expect(result).toEqual({ claimId: 77 });
    expect(vi.mocked(db.createStoreClaim)).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 50,
        storeId: 200,
        claimantUserId: 1,
        justification: "I own this Walmart",
      }),
    );
  });
});

describe("storeClaims.approve", () => {
  beforeEach(() => {
    vi.mocked(db.getStoreClaimById).mockReset();
    vi.mocked(db.getStoreById).mockReset();
    vi.mocked(db.linkStoreToBrand).mockReset();
    vi.mocked(db.markStoreClaimDecided).mockReset();
    vi.mocked(db.getUserById).mockReset();
  });

  it("rejects non-super-admin", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.storeClaims.approve({ id: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects when claim is not pending", async () => {
    vi.mocked(db.getStoreClaimById).mockResolvedValue(makeClaim({ status: "approved" }));
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "super_admin" })));
    await expect(caller.storeClaims.approve({ id: 11 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("race: rejects when store became claimed between submit and approve", async () => {
    vi.mocked(db.getStoreClaimById).mockResolvedValue(makeClaim());
    vi.mocked(db.getStoreById).mockResolvedValue(makeStore({ brandId: 999 }));
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "super_admin" })));
    await expect(caller.storeClaims.approve({ id: 11 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(vi.mocked(db.linkStoreToBrand)).not.toHaveBeenCalled();
  });

  it("happy path: links store + marks decided", async () => {
    vi.mocked(db.getStoreClaimById).mockResolvedValue(makeClaim({ id: 11, brandId: 50, storeId: 200 }));
    vi.mocked(db.getStoreById).mockResolvedValue(makeStore({ brandId: null }));
    vi.mocked(db.linkStoreToBrand).mockResolvedValue(undefined);
    vi.mocked(db.markStoreClaimDecided).mockResolvedValue(undefined);
    vi.mocked(db.getUserById).mockResolvedValue(makeUser({ email: "claimant@example.com" }));
    const caller = appRouter.createCaller(makeCtx(makeUser({ id: 99, role: "super_admin" })));
    const result = await caller.storeClaims.approve({ id: 11, reviewerNote: "ok" });
    expect(result).toEqual({ ok: true });
    expect(vi.mocked(db.linkStoreToBrand)).toHaveBeenCalledWith(200, 50);
    expect(vi.mocked(db.markStoreClaimDecided)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, status: "approved", reviewerNote: "ok", reviewedByUserId: 99 }),
    );
  });
});

describe("storeClaims.reject", () => {
  beforeEach(() => {
    vi.mocked(db.getStoreClaimById).mockReset();
    vi.mocked(db.markStoreClaimDecided).mockReset();
    vi.mocked(db.linkStoreToBrand).mockReset();
  });

  it("rejects non-super-admin", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.storeClaims.reject({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("marks rejected, does not link store", async () => {
    vi.mocked(db.getStoreClaimById).mockResolvedValue(makeClaim());
    vi.mocked(db.markStoreClaimDecided).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(makeUser({ id: 99, role: "super_admin" })));
    await caller.storeClaims.reject({ id: 11, reviewerNote: "no proof" });
    expect(vi.mocked(db.markStoreClaimDecided)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, status: "rejected", reviewerNote: "no proof", reviewedByUserId: 99 }),
    );
    expect(vi.mocked(db.linkStoreToBrand)).not.toHaveBeenCalled();
  });
});

describe("storeClaims.search", () => {
  beforeEach(() => {
    vi.mocked(db.searchUnclaimedStores).mockReset();
    vi.mocked(db.getVendorMembershipsForUser).mockReset();
  });

  it("requires vendor membership", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([]);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    await expect(caller.storeClaims.search({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns search results", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "staff" },
    ]);
    vi.mocked(db.searchUnclaimedStores).mockResolvedValue([makeStore({ id: 1 }), makeStore({ id: 2 })]);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    const result = await caller.storeClaims.search({ query: "walmart" });
    expect(result).toHaveLength(2);
    expect(vi.mocked(db.searchUnclaimedStores)).toHaveBeenCalledWith(
      expect.objectContaining({ query: "walmart", limit: 50 }),
    );
  });
});

describe("storeClaims.myStores / myClaims / listPending", () => {
  beforeEach(() => {
    vi.mocked(db.getVendorMembershipsForUser).mockReset();
    vi.mocked(db.listStoresForBrand).mockReset();
    vi.mocked(db.listStoreClaimsForBrand).mockReset();
    vi.mocked(db.listPendingStoreClaims).mockReset();
  });

  it("myStores returns stores for the active brand", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "staff" },
    ]);
    vi.mocked(db.listStoresForBrand).mockResolvedValue([makeStore({ id: 1 }), makeStore({ id: 2 })]);
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand({ id: 50 })));
    const result = await caller.storeClaims.myStores();
    expect(result).toHaveLength(2);
    expect(vi.mocked(db.listStoresForBrand)).toHaveBeenCalledWith(50);
  });

  it("myStores rejects when no active brand", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "staff" },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser(), null));
    await expect(caller.storeClaims.myStores()).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("listPending rejects non-super-admin", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.storeClaims.listPending()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
```

- [ ] **Step 2: Run tests (expect failure)**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm test server/store-claims.test.ts
```

Expected: tests fail because `caller.storeClaims` is undefined.

- [ ] **Step 3: Add the `storeClaims` sub-router**

Open `server/routers.ts`. Ensure these are imported at the top (most already are from prior phases):
- From `"./_core/trpc"`: `vendorStaffProcedure`, `vendorAdminProcedure`, `superAdminProcedure`
- From `"./_core/notification"`: `notifyOwner`
- From `"./services/userAuth"`: `sendUserEmail`
- From `"@trpc/server"`: `TRPCError`
- From `"zod"`: `z`

Add a new sub-router inside `appRouter`. Place near `vendorApplications`:

```ts
  storeClaims: router({
    search: vendorStaffProcedure
      .input(z.object({
        query: z.string().trim().max(255).optional(),
        city: z.string().trim().max(128).optional(),
      }))
      .query(async ({ input }) => {
        return db.searchUnclaimedStores({ ...input, limit: 50 });
      }),

    myStores: vendorStaffProcedure.query(async ({ ctx }) => {
      if (!ctx.brand) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No hay marca activa" });
      }
      return db.listStoresForBrand(ctx.brand.id);
    }),

    myClaims: vendorStaffProcedure.query(async ({ ctx }) => {
      if (!ctx.brand) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No hay marca activa" });
      }
      return db.listStoreClaimsForBrand(ctx.brand.id);
    }),

    claim: vendorAdminProcedure
      .input(z.object({
        storeId: z.number().int().positive(),
        justification: z.string().trim().max(2000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        if (!ctx.brand) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "No hay marca activa" });
        }
        const store = await db.getStoreById(input.storeId);
        if (!store) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Tienda no encontrada" });
        }
        if (store.brandId) {
          throw new TRPCError({ code: "CONFLICT", message: "Esa tienda ya fue reclamada" });
        }
        const existing = await db.getPendingClaimForBrandStore(ctx.brand.id, input.storeId);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Ya tenés una reclamación pendiente para esa tienda" });
        }
        const id = await db.createStoreClaim({
          brandId: ctx.brand.id,
          storeId: input.storeId,
          claimantUserId: ctx.user.id,
          justification: input.justification ?? null,
        });
        notifyOwner({
          title: "[Tulistica] Nueva reclamación de tienda",
          content: `${ctx.brand.companyName} → store #${input.storeId} (${store.name})`,
        }).catch(() => {});
        return { claimId: id };
      }),

    listPending: superAdminProcedure.query(() => db.listPendingStoreClaims()),

    approve: superAdminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        reviewerNote: z.string().trim().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const claim = await db.getStoreClaimById(input.id);
        if (!claim || claim.status !== "pending") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Reclamación no encontrada o no pendiente" });
        }
        // Race protection: re-fetch the store at decision time.
        const store = await db.getStoreById(claim.storeId);
        if (!store) {
          throw new TRPCError({ code: "NOT_FOUND", message: "La tienda ya no existe" });
        }
        if (store.brandId) {
          throw new TRPCError({ code: "CONFLICT", message: "Esa tienda ya fue reclamada" });
        }
        await db.linkStoreToBrand(claim.storeId, claim.brandId);
        await db.markStoreClaimDecided({
          id: input.id,
          status: "approved",
          reviewerNote: input.reviewerNote,
          reviewedByUserId: ctx.user.id,
        });
        const claimant = await db.getUserById(claim.claimantUserId);
        if (claimant?.email) {
          sendUserEmail({
            to: claimant.email,
            subject: `Reclamación aprobada: ${store.name}`,
            body: `Tu reclamación de ${store.name} fue aprobada. Ya podés gestionar la tienda desde /brand/stores.${input.reviewerNote ? `\n\nNota del equipo: ${input.reviewerNote}` : ""}`,
          }).catch(() => {});
        }
        return { ok: true };
      }),

    reject: superAdminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        reviewerNote: z.string().trim().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const claim = await db.getStoreClaimById(input.id);
        if (!claim || claim.status !== "pending") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Reclamación no encontrada o no pendiente" });
        }
        await db.markStoreClaimDecided({
          id: input.id,
          status: "rejected",
          reviewerNote: input.reviewerNote,
          reviewedByUserId: ctx.user.id,
        });
        const claimant = await db.getUserById(claim.claimantUserId);
        const store = await db.getStoreById(claim.storeId);
        if (claimant?.email) {
          sendUserEmail({
            to: claimant.email,
            subject: `Reclamación rechazada${store ? `: ${store.name}` : ""}`,
            body: `Tu reclamación no avanzó.${input.reviewerNote ? `\n\nMotivo: ${input.reviewerNote}` : ""}\n\nPodés volver a aplicar desde /brand/stores/claim.`,
          }).catch(() => {});
        }
        return { ok: true };
      }),
  }),
```

- [ ] **Step 4: Run tests**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm test server/store-claims.test.ts
```

Expected: all 15 tests pass.

- [ ] **Step 5: Run full suite**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm test
```

Expected: 73 prior + 15 new = 88 total. All pass.

- [ ] **Step 6: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add server/routers.ts server/store-claims.test.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb status
# confirm exactly 2 files staged
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(vendor): storeClaims router with claim/approve/reject + race protection"
```

---

## Task 4: BrandStores page

**Files:**
- Create: `client/src/pages/brand/BrandStores.tsx`

**Strict file scope**: ONLY this one file.

- [ ] **Step 1: Create the file**

```tsx
import { Link } from "wouter";
import { BrandLayout } from "@/components/BrandLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, Plus } from "lucide-react";

function StatusBadge({ status }: { status: "pending" | "approved" | "rejected" }) {
  const variant: "default" | "secondary" | "destructive" | "outline" =
    status === "approved" ? "default" : status === "rejected" ? "destructive" : "secondary";
  const label = status === "pending" ? "Pendiente" : status === "approved" ? "Aprobada" : "Rechazada";
  return <Badge variant={variant}>{label}</Badge>;
}

export default function BrandStores() {
  const myStores = trpc.storeClaims.myStores.useQuery();
  const myClaims = trpc.storeClaims.myClaims.useQuery();

  const stores = myStores.data ?? [];
  const claims = myClaims.data ?? [];

  return (
    <BrandLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Mis tiendas</h1>
            <p className="text-sm text-muted-foreground">
              Tiendas reclamadas por tu marca y reclamaciones en trámite.
            </p>
          </div>
          <Link href="/brand/stores/claim">
            <Button>
              <Plus className="w-4 h-4 mr-1" /> Reclamar tienda
            </Button>
          </Link>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Tiendas activas</h2>
          {stores.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Aún no tenés tiendas activas. Empezá por <Link href="/brand/stores/claim" className="underline">reclamar tu primera tienda</Link>.
              </CardContent>
            </Card>
          ) : (
            stores.map(s => (
              <Card key={s.id}>
                <CardHeader>
                  <CardTitle className="text-base">{s.name}</CardTitle>
                  <CardDescription className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" />
                    {s.address ?? "Sin dirección"}{s.city ? ` · ${s.city}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground">
                  Próximamente: panel por tienda
                </CardContent>
              </Card>
            ))
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">Reclamaciones</h2>
          {claims.length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                No hay reclamaciones registradas.
              </CardContent>
            </Card>
          ) : (
            claims.map(c => (
              <Card key={c.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{c.store.name}</CardTitle>
                      <CardDescription>
                        {c.store.city ?? ""}
                      </CardDescription>
                    </div>
                    <StatusBadge status={c.status} />
                  </div>
                </CardHeader>
                {c.reviewerNote && (
                  <CardContent className="text-sm">
                    <span className="text-muted-foreground">Nota del equipo:</span> {c.reviewerNote}
                  </CardContent>
                )}
                {c.status === "rejected" && (
                  <CardContent>
                    <Link href="/brand/stores/claim">
                      <Button variant="outline" size="sm">Volver a reclamar</Button>
                    </Link>
                  </CardContent>
                )}
              </Card>
            ))
          )}
        </section>
      </div>
    </BrandLayout>
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
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/pages/brand/BrandStores.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(vendor): BrandStores page (my stores + my claims)"
```

---

## Task 5: BrandStoresClaim page

**Files:**
- Create: `client/src/pages/brand/BrandStoresClaim.tsx`

**Strict file scope**: ONLY this one file.

- [ ] **Step 1: Create the file**

```tsx
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { BrandLayout } from "@/components/BrandLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, MapPin } from "lucide-react";

type DialogState = { storeId: number; storeName: string } | null;

export default function BrandStoresClaim() {
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [searchQuery, setSearchQuery] = useState<{ query?: string; city?: string }>({});

  const searchResults = trpc.storeClaims.search.useQuery(searchQuery, {
    enabled: Object.keys(searchQuery).length > 0,
  });

  const claimMutation = trpc.storeClaims.claim.useMutation({
    onSuccess: () => {
      toast.success("Reclamación enviada");
      utils.storeClaims.myClaims.invalidate();
      utils.storeClaims.search.invalidate();
      setDialog(null);
      setJustification("");
      navigate("/brand/stores");
    },
    onError: (err) => toast.error(err.message),
  });

  const [dialog, setDialog] = useState<DialogState>(null);
  const [justification, setJustification] = useState("");

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSearchQuery({
      query: query.trim() || undefined,
      city: city.trim() || undefined,
    });
  };

  const handleConfirm = () => {
    if (!dialog) return;
    claimMutation.mutate({
      storeId: dialog.storeId,
      justification: justification.trim() || undefined,
    });
  };

  const stores = searchResults.data ?? [];

  return (
    <BrandLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Reclamar tienda</h1>
            <p className="text-sm text-muted-foreground">
              Buscá tu tienda en la base de datos pública y enviá una reclamación.
            </p>
          </div>
          <Link href="/brand/stores">
            <Button variant="outline">Volver</Button>
          </Link>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
              <Input
                placeholder="Nombre de la tienda"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="flex-1"
              />
              <Input
                placeholder="Ciudad (opcional)"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="sm:max-w-xs"
              />
              <Button type="submit">
                <Search className="w-4 h-4 mr-1" /> Buscar
              </Button>
            </form>
          </CardContent>
        </Card>

        <section className="space-y-3">
          {Object.keys(searchQuery).length === 0 && (
            <p className="text-sm text-muted-foreground">Ingresá un nombre o ciudad para empezar.</p>
          )}
          {searchResults.isLoading && (
            <p className="text-sm text-muted-foreground">Buscando...</p>
          )}
          {searchResults.data && stores.length === 0 && (
            <p className="text-sm text-muted-foreground">No se encontraron tiendas sin reclamar.</p>
          )}
          {stores.map(s => (
            <Card key={s.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base">{s.name}</CardTitle>
                    <CardDescription className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {s.address ?? "Sin dirección"}{s.city ? ` · ${s.city}` : ""}
                    </CardDescription>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      setDialog({ storeId: s.id, storeName: s.name });
                      setJustification("");
                    }}
                  >
                    Reclamar
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))}
        </section>

        <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) { setDialog(null); setJustification(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reclamar {dialog?.storeName}</DialogTitle>
              <DialogDescription>
                Contanos por qué sos el dueño o el operador de esta tienda. Un super-admin revisa cada reclamación.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="justification">Justificación (opcional)</Label>
              <Textarea
                id="justification"
                rows={4}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Ej: Soy el gerente del local, mi cédula jurídica es 3-101-xxxxxx"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialog(null); setJustification(""); }}>Cancelar</Button>
              <Button onClick={handleConfirm} disabled={claimMutation.isPending}>
                {claimMutation.isPending ? "Enviando..." : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </BrandLayout>
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
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/pages/brand/BrandStoresClaim.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(vendor): BrandStoresClaim search + claim dialog"
```

---

## Task 6: Add "Stores" nav item to BrandLayout

**Files:**
- Modify: `client/src/components/BrandLayout.tsx`

**Strict file scope**: ONLY this one file.

- [ ] **Step 1: Add nav item**

Open `client/src/components/BrandLayout.tsx`. Find the existing `NAV` array at the top of the file. It currently has:

```ts
const NAV = [
  { href: "/brand/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/brand/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/brand/billing", label: "Billing", icon: Receipt },
  { href: "/brand/settings", label: "Settings", icon: Settings },
];
```

Add a Store icon to the lucide-react import at the top of the file (find the existing import; add `Store` to the destructure):

```ts
import {
  LayoutDashboard,
  Megaphone,
  Receipt,
  Settings,
  LogOut,
  AlertCircle,
  Store,
} from "lucide-react";
```

Then update the NAV array to insert the Stores item BEFORE Campaigns (so Dashboard → Stores → Campaigns → Billing → Settings):

```ts
const NAV = [
  { href: "/brand/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/brand/stores", label: "Stores", icon: Store },
  { href: "/brand/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/brand/billing", label: "Billing", icon: Receipt },
  { href: "/brand/settings", label: "Settings", icon: Settings },
];
```

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean.

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/components/BrandLayout.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(brand-portal): Stores nav item in BrandLayout sidebar"
```

---

## Task 7: Refactor AdminVendorQueue into tabs

**Files:**
- Modify: `client/src/pages/admin/AdminVendorQueue.tsx`

**Strict file scope**: ONLY this one file.

This task adds a second tab to the existing super-admin queue page. The vendor-applications content stays as-is; we add a "Store claims" tab next to it.

If the `Tabs` shadcn component doesn't exist, add it:
```
ls client/src/components/ui/tabs.tsx 2>/dev/null || npx shadcn@latest add tabs
```

- [ ] **Step 1: Rewrite the page**

Overwrite `client/src/pages/admin/AdminVendorQueue.tsx` with:

```tsx
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Receipt, Check, X, MapPin } from "lucide-react";

type Kind = "approve" | "reject";
type AppDialog = { kind: Kind; id: number; label: string; target: "vendorApp" | "storeClaim" } | null;

export default function AdminVendorQueue() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();

  const pendingApps = trpc.vendorApplications.listPending.useQuery(undefined, {
    enabled: user?.role === "super_admin",
  });
  const pendingClaims = trpc.storeClaims.listPending.useQuery(undefined, {
    enabled: user?.role === "super_admin",
  });

  const approveApp = trpc.vendorApplications.approve.useMutation({
    onSuccess: () => { toast.success("Solicitud aprobada"); utils.vendorApplications.listPending.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const rejectApp = trpc.vendorApplications.reject.useMutation({
    onSuccess: () => { toast.success("Solicitud rechazada"); utils.vendorApplications.listPending.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const approveClaim = trpc.storeClaims.approve.useMutation({
    onSuccess: () => { toast.success("Reclamación aprobada"); utils.storeClaims.listPending.invalidate(); },
    onError: (err) => toast.error(err.message),
  });
  const rejectClaim = trpc.storeClaims.reject.useMutation({
    onSuccess: () => { toast.success("Reclamación rechazada"); utils.storeClaims.listPending.invalidate(); },
    onError: (err) => toast.error(err.message),
  });

  const [dialog, setDialog] = useState<AppDialog>(null);
  const [note, setNote] = useState("");

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </main>
    );
  }

  if (!user || user.role !== "super_admin") {
    navigate("/dashboard", { replace: true });
    return null;
  }

  const apps = pendingApps.data ?? [];
  const claims = pendingClaims.data ?? [];

  const handleConfirm = async () => {
    if (!dialog) return;
    const args = { id: dialog.id, reviewerNote: note.trim() || undefined };
    if (dialog.target === "vendorApp") {
      if (dialog.kind === "approve") await approveApp.mutateAsync(args).catch(() => {});
      else await rejectApp.mutateAsync(args).catch(() => {});
    } else {
      if (dialog.kind === "approve") await approveClaim.mutateAsync(args).catch(() => {});
      else await rejectClaim.mutateAsync(args).catch(() => {});
    }
    setDialog(null);
    setNote("");
  };

  const defaultTab = apps.length > 0 || claims.length === 0 ? "applications" : "claims";

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
            tulistica · admin
          </span>
        </div>
      </header>

      <main className="flex-1 container py-8 space-y-6 max-w-4xl">
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            <TabsTrigger value="applications">
              Solicitudes de vendedor
              {apps.length > 0 && <Badge variant="secondary" className="ml-2">{apps.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="claims">
              Reclamaciones de tienda
              {claims.length > 0 && <Badge variant="secondary" className="ml-2">{claims.length}</Badge>}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="applications" className="space-y-4 pt-4">
            {apps.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>
            ) : (
              apps.map(app => (
                <Card key={app.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle>{app.companyName}</CardTitle>
                        <CardDescription>
                          Aplicante #{app.applicantUserId}
                          {app.contactName ? ` · ${app.contactName}` : ""}
                          {app.contactPhone ? ` · ${app.contactPhone}` : ""}
                        </CardDescription>
                      </div>
                      <Badge variant="outline">{app.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {app.description && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Sobre la tienda:</span> {app.description}
                      </div>
                    )}
                    {app.desiredStoresNote && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Tiendas:</span> {app.desiredStoresNote}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => { setDialog({ kind: "approve", id: app.id, label: app.companyName, target: "vendorApp" }); setNote(""); }}>
                        <Check className="w-4 h-4 mr-1" /> Aprobar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setDialog({ kind: "reject", id: app.id, label: app.companyName, target: "vendorApp" }); setNote(""); }}>
                        <X className="w-4 h-4 mr-1" /> Rechazar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="claims" className="space-y-4 pt-4">
            {claims.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay reclamaciones pendientes.</p>
            ) : (
              claims.map(c => (
                <Card key={c.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="text-base">{c.store.name}</CardTitle>
                        <CardDescription className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {c.store.address ?? "Sin dirección"}{c.store.city ? ` · ${c.store.city}` : ""}
                        </CardDescription>
                        <div className="text-xs text-muted-foreground mt-1">
                          Marca: <span className="font-medium">{c.brand.companyName}</span> · Aplicante #{c.claimantUserId}
                        </div>
                      </div>
                      <Badge variant="outline">{c.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {c.justification && (
                      <div className="text-sm">
                        <span className="text-muted-foreground">Justificación:</span> {c.justification}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => { setDialog({ kind: "approve", id: c.id, label: c.store.name, target: "storeClaim" }); setNote(""); }}>
                        <Check className="w-4 h-4 mr-1" /> Aprobar
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setDialog({ kind: "reject", id: c.id, label: c.store.name, target: "storeClaim" }); setNote(""); }}>
                        <X className="w-4 h-4 mr-1" /> Rechazar
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) { setDialog(null); setNote(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {dialog?.kind === "approve" ? "Aprobar" : "Rechazar"} {dialog?.target === "vendorApp" ? "solicitud" : "reclamación"} de {dialog?.label}
              </DialogTitle>
              <DialogDescription>
                {dialog?.kind === "approve" ? "El aplicante recibirá un correo de confirmación." : "El aplicante recibirá un correo con el motivo."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="reviewerNote">Nota (opcional)</Label>
              <Textarea
                id="reviewerNote"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialog(null); setNote(""); }}>Cancelar</Button>
              <Button onClick={handleConfirm}>Confirmar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
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

If shadcn `tabs` was added, include `client/src/components/ui/tabs.tsx` in the commit.

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/pages/admin/AdminVendorQueue.tsx
# If tabs was newly added by shadcn, also: git add client/src/components/ui/tabs.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(admin): tabbed queue with vendor applications + store claims"
```

---

## Task 8: Wire routes

**Files:**
- Modify: `client/src/App.tsx`

**Strict file scope**: ONLY this one file.

- [ ] **Step 1: Add routes**

Open `client/src/App.tsx`. Add two imports near the other brand-page imports:

```tsx
import BrandStores from "./pages/brand/BrandStores";
import BrandStoresClaim from "./pages/brand/BrandStoresClaim";
```

Add two routes inside the routes block (place near the other `/brand/*` routes):

```tsx
<Route path="/brand/stores" component={BrandStores} />
<Route path="/brand/stores/claim" component={BrandStoresClaim} />
```

- [ ] **Step 2: Final verification**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check && pnpm test && pnpm build 2>&1 | tail -10
```

Expected:
- type-check clean
- 88/88 tests pass
- build succeeds

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/App.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(vendor): wire /brand/stores and /brand/stores/claim routes"
```

---

# Final verification

- [ ] **Step 1: Full pipeline**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check && pnpm test && pnpm build 2>&1 | tail -10
```

Expected: all green.
