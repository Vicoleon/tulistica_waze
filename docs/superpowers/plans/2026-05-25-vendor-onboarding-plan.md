# Vendor Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "become a vendor" flow: applicants submit a form, super-admin sees a queue and approves/rejects, approval creates a vendor brand and promotes the user to `vendor_admin`.

**Architecture:** New `vendor_applications` table holds pending applications. New tRPC sub-router `vendorApplications` exposes `apply` / `myStatus` / `listPending` / `approve` / `reject`. Three new pages: applicant form, applicant status, super-admin queue. Plus a small dashboard pill.

**Tech Stack:** Same as Phases 1–3-A — TypeScript, React 19 + Vite, Wouter, tRPC v11, Drizzle ORM, MySQL 8, Vitest.

**Source spec:** [docs/superpowers/specs/2026-05-25-vendor-onboarding-design.md](../specs/2026-05-25-vendor-onboarding-design.md)

---

## File map

| Path | Action | Notes |
|---|---|---|
| `drizzle/0011_vendor_applications.sql` | **create** | one migration |
| `drizzle/schema.ts` | modify | append `vendorApplications` table + types |
| `server/db.ts` | modify | add 7 helpers |
| `server/routers.ts` | modify | add `vendorApplications` sub-router |
| `server/vendor-applications.test.ts` | **create** | vitest coverage |
| `client/src/pages/vendor/VendorApply.tsx` | **create** | applicant form |
| `client/src/pages/vendor/VendorApplicationStatus.tsx` | **create** | applicant status page |
| `client/src/pages/admin/AdminVendorQueue.tsx` | **create** | super-admin queue |
| `client/src/App.tsx` | modify | three new routes |
| `client/src/pages/Dashboard.tsx` | modify | small status pill |

---

## Task 1: Migration 0011 + schema

**Files:**
- Create: `drizzle/0011_vendor_applications.sql`
- Modify: `drizzle/schema.ts`

**Strict file scope**: ONLY these two files. Before commit, run `git status` and confirm only those two are staged.

- [ ] **Step 1: Create the migration**

Create `drizzle/0011_vendor_applications.sql` with exactly:

```sql
-- 0011_vendor_applications.sql
-- Vendor application + approval workflow. Approval creates a brands row
-- with kind='vendor' and a brand_members row promoting the applicant.

CREATE TABLE vendor_applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  applicantUserId INT NOT NULL,
  companyName VARCHAR(255) NOT NULL,
  contactName VARCHAR(255),
  contactPhone VARCHAR(32),
  description TEXT,
  desiredStoresNote TEXT,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  reviewerNote TEXT,
  reviewedByUserId INT,
  reviewedAt TIMESTAMP NULL,
  resultingBrandId INT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_vendor_apps_applicant (applicantUserId),
  INDEX idx_vendor_apps_status (status)
);
```

- [ ] **Step 2: Add the schema table**

Open `drizzle/schema.ts`. At the very bottom (after the last table definition), append:

```ts
// ============ VENDOR APPLICATIONS ============
export const vendorApplications = mysqlTable("vendor_applications", {
  id: int("id").autoincrement().primaryKey(),
  applicantUserId: int("applicantUserId").notNull(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  description: text("description"),
  desiredStoresNote: text("desiredStoresNote"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).default("pending").notNull(),
  reviewerNote: text("reviewerNote"),
  reviewedByUserId: int("reviewedByUserId"),
  reviewedAt: timestamp("reviewedAt"),
  resultingBrandId: int("resultingBrandId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, (table) => [
  index("idx_vendor_apps_applicant").on(table.applicantUserId),
  index("idx_vendor_apps_status").on(table.status),
]);

export type VendorApplication = typeof vendorApplications.$inferSelect;
export type InsertVendorApplication = typeof vendorApplications.$inferInsert;
```

- [ ] **Step 3: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean. No callers reference `vendorApplications` yet.

- [ ] **Step 4: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add drizzle/0011_vendor_applications.sql drizzle/schema.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb status
```

Confirm exactly 2 files staged. Then:

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(db): migration 0011 + vendorApplications schema"
```

---

## Task 2: db.ts helpers

**Files:**
- Modify: `server/db.ts`

**Strict file scope**: ONLY `server/db.ts`. Confirm via `git status` before commit.

- [ ] **Step 1: Update top-of-file schema imports**

Open `server/db.ts`. Find the existing `import { ... } from "../drizzle/schema"` block. Add `vendorApplications` to that import. Add `VendorApplication` and `InsertVendorApplication` to the existing `import type { ... }` block from the same module.

- [ ] **Step 2: Append helpers at the bottom of db.ts**

Add at the very end of the file:

```ts
// ============ VENDOR APPLICATION HELPERS ============

export async function createVendorApplication(data: InsertVendorApplication): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(vendorApplications).values(data);
  return (result as any)[0]?.insertId ?? null;
}

export async function getPendingApplicationForUser(userId: number): Promise<VendorApplication | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(vendorApplications)
    .where(and(
      eq(vendorApplications.applicantUserId, userId),
      eq(vendorApplications.status, "pending"),
    ))
    .limit(1);
  return rows[0];
}

export async function getLatestApplicationForUser(userId: number): Promise<VendorApplication | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(vendorApplications)
    .where(eq(vendorApplications.applicantUserId, userId))
    .orderBy(desc(vendorApplications.createdAt))
    .limit(1);
  return rows[0];
}

export async function listPendingApplications(): Promise<VendorApplication[]> {
  const db = await getDb();
  if (!db) return [];
  return db
    .select()
    .from(vendorApplications)
    .where(eq(vendorApplications.status, "pending"))
    .orderBy(desc(vendorApplications.createdAt));
}

export async function getVendorApplicationById(id: number): Promise<VendorApplication | undefined> {
  const db = await getDb();
  if (!db) return undefined;
  const rows = await db
    .select()
    .from(vendorApplications)
    .where(eq(vendorApplications.id, id))
    .limit(1);
  return rows[0];
}

export async function markApplicationDecided(opts: {
  id: number;
  status: "approved" | "rejected";
  reviewerNote?: string;
  reviewedByUserId: number;
  resultingBrandId?: number;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(vendorApplications)
    .set({
      status: opts.status,
      reviewerNote: opts.reviewerNote ?? null,
      reviewedByUserId: opts.reviewedByUserId,
      reviewedAt: new Date(),
      resultingBrandId: opts.resultingBrandId ?? null,
    })
    .where(eq(vendorApplications.id, opts.id));
}

/**
 * Promote a user from consumer to vendor_admin. Never downgrades — if the
 * user is super_admin, vendor_admin, or vendor_staff, leave the role alone.
 */
export async function promoteUserToVendorAdmin(userId: number): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db
    .update(users)
    .set({ role: "vendor_admin" })
    .where(and(eq(users.id, userId), eq(users.role, "consumer")));
}
```

The drizzle helpers `eq`, `and`, `desc` should already be imported at the top from `"drizzle-orm"`. If `desc` isn't, add it to the existing drizzle-orm import.

- [ ] **Step 3: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean.

- [ ] **Step 4: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add server/db.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb status
```

Confirm exactly 1 file staged. Then:

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(db): vendor application helpers + non-downgrading role promotion"
```

---

## Task 3: tRPC router + tests (TDD)

**Files:**
- Modify: `server/routers.ts`
- Create: `server/vendor-applications.test.ts`

**Strict file scope**: ONLY these two files.

- [ ] **Step 1: Write the failing test file**

Create `server/vendor-applications.test.ts`:

```ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Brand, User, VendorApplication } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getUserById: vi.fn(),
  getPendingApplicationForUser: vi.fn(),
  getLatestApplicationForUser: vi.fn(),
  createVendorApplication: vi.fn(),
  listPendingApplications: vi.fn(),
  getVendorApplicationById: vi.fn(),
  markApplicationDecided: vi.fn(),
  promoteUserToVendorAdmin: vi.fn(),
  createBrand: vi.fn(),
  createBrandMember: vi.fn(),
  getAllMembershipsForUser: vi.fn(),
  getVendorMembershipsForUser: vi.fn(),
  getAdvertiserMembershipsForUser: vi.fn(),
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
    name: "Applicant",
    email: "applicant@example.com",
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

function makeApp(overrides: Partial<VendorApplication> = {}): VendorApplication {
  return {
    id: 11,
    applicantUserId: 1,
    companyName: "Pulpería La Esquina",
    contactName: null,
    contactPhone: null,
    description: null,
    desiredStoresNote: null,
    status: "pending",
    reviewerNote: null,
    reviewedByUserId: null,
    reviewedAt: null,
    resultingBrandId: null,
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

describe("vendorApplications.apply", () => {
  beforeEach(() => {
    vi.mocked(db.getPendingApplicationForUser).mockReset();
    vi.mocked(db.createVendorApplication).mockReset();
  });

  it("rejects when user already has a pending application", async () => {
    vi.mocked(db.getPendingApplicationForUser).mockResolvedValue(makeApp());
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    await expect(
      caller.vendorApplications.apply({ companyName: "Acme" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects unverified user (verifiedProcedure gate)", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ emailVerified: false })));
    await expect(
      caller.vendorApplications.apply({ companyName: "Acme" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates application on happy path", async () => {
    vi.mocked(db.getPendingApplicationForUser).mockResolvedValue(undefined);
    vi.mocked(db.createVendorApplication).mockResolvedValue(42);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    const result = await caller.vendorApplications.apply({
      companyName: "Acme",
      contactName: "Jane",
    });
    expect(result).toEqual({ applicationId: 42 });
    expect(vi.mocked(db.createVendorApplication)).toHaveBeenCalledWith(
      expect.objectContaining({ applicantUserId: 1, companyName: "Acme" }),
    );
  });
});

describe("vendorApplications.myStatus", () => {
  beforeEach(() => {
    vi.mocked(db.getLatestApplicationForUser).mockReset();
  });

  it("returns null when user has no applications", async () => {
    vi.mocked(db.getLatestApplicationForUser).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    const result = await caller.vendorApplications.myStatus();
    expect(result).toEqual({ application: null });
  });

  it("returns the latest application regardless of status", async () => {
    const rejected = makeApp({ status: "rejected", reviewerNote: "missing tax id" });
    vi.mocked(db.getLatestApplicationForUser).mockResolvedValue(rejected);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    const result = await caller.vendorApplications.myStatus();
    expect(result.application).toMatchObject({ status: "rejected", reviewerNote: "missing tax id" });
  });
});

describe("vendorApplications.listPending", () => {
  it("rejects non-super-admin (consumer)", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.vendorApplications.listPending()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns pending list for super_admin", async () => {
    vi.mocked(db.listPendingApplications).mockResolvedValue([makeApp({ id: 1 }), makeApp({ id: 2 })]);
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "super_admin" })));
    const result = await caller.vendorApplications.listPending();
    expect(result).toHaveLength(2);
  });
});

describe("vendorApplications.approve", () => {
  beforeEach(() => {
    vi.mocked(db.getVendorApplicationById).mockReset();
    vi.mocked(db.getUserById).mockReset();
    vi.mocked(db.createBrand).mockReset();
    vi.mocked(db.createBrandMember).mockReset();
    vi.mocked(db.promoteUserToVendorAdmin).mockReset();
    vi.mocked(db.markApplicationDecided).mockReset();
  });

  it("rejects non-super-admin", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.vendorApplications.approve({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when application is not pending", async () => {
    vi.mocked(db.getVendorApplicationById).mockResolvedValue(makeApp({ status: "approved" }));
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "super_admin" })));
    await expect(caller.vendorApplications.approve({ id: 11 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates brand + member + promotes user + marks decided", async () => {
    vi.mocked(db.getVendorApplicationById).mockResolvedValue(makeApp({ id: 11, applicantUserId: 1, companyName: "Acme" }));
    vi.mocked(db.getUserById).mockResolvedValue(makeUser({ id: 1, email: "a@b.com" }));
    vi.mocked(db.createBrand).mockResolvedValue(500);
    vi.mocked(db.createBrandMember).mockResolvedValue(undefined);
    vi.mocked(db.promoteUserToVendorAdmin).mockResolvedValue(undefined);
    vi.mocked(db.markApplicationDecided).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(makeUser({ id: 99, role: "super_admin" })));
    const result = await caller.vendorApplications.approve({ id: 11, reviewerNote: "looks good" });
    expect(result.brandId).toBe(500);
    expect(vi.mocked(db.createBrand)).toHaveBeenCalledWith(expect.objectContaining({ kind: "vendor", companyName: "Acme" }));
    expect(vi.mocked(db.createBrandMember)).toHaveBeenCalledWith(expect.objectContaining({ brandId: 500, userId: 1, membershipRole: "owner" }));
    expect(vi.mocked(db.promoteUserToVendorAdmin)).toHaveBeenCalledWith(1);
    expect(vi.mocked(db.markApplicationDecided)).toHaveBeenCalledWith(expect.objectContaining({
      id: 11, status: "approved", reviewerNote: "looks good", reviewedByUserId: 99, resultingBrandId: 500,
    }));
  });
});

describe("vendorApplications.reject", () => {
  beforeEach(() => {
    vi.mocked(db.getVendorApplicationById).mockReset();
    vi.mocked(db.markApplicationDecided).mockReset();
    vi.mocked(db.createBrand).mockReset();
    vi.mocked(db.promoteUserToVendorAdmin).mockReset();
  });

  it("rejects non-super-admin", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.vendorApplications.reject({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("marks application rejected, does not create brand, does not touch role", async () => {
    vi.mocked(db.getVendorApplicationById).mockResolvedValue(makeApp({ id: 11 }));
    vi.mocked(db.markApplicationDecided).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(makeUser({ id: 99, role: "super_admin" })));
    await caller.vendorApplications.reject({ id: 11, reviewerNote: "missing info" });
    expect(vi.mocked(db.markApplicationDecided)).toHaveBeenCalledWith(expect.objectContaining({
      id: 11, status: "rejected", reviewerNote: "missing info", reviewedByUserId: 99,
    }));
    expect(vi.mocked(db.createBrand)).not.toHaveBeenCalled();
    expect(vi.mocked(db.promoteUserToVendorAdmin)).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test (expect failure)**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm test server/vendor-applications.test.ts
```

Expected: tests fail with `caller.vendorApplications` being undefined.

- [ ] **Step 3: Add the router to server/routers.ts**

Open `server/routers.ts`. Add to the import block from `"./_core/trpc"` if not already present: `superAdminProcedure`, `verifiedProcedure`, `protectedProcedure`. Add to existing imports:

```ts
import { notifyOwner } from "./_core/notification";
import { sendUserEmail } from "./services/userAuth";
```

Inside the `appRouter` definition, add a new sub-router. Place it near the other sub-routers (e.g., after `brandAuth` if that's there, or anywhere in the `router({ ... })` block):

```ts
  vendorApplications: router({
    apply: verifiedProcedure
      .input(z.object({
        companyName: z.string().trim().min(2).max(255),
        contactName: z.string().trim().max(255).optional(),
        contactPhone: z.string().trim().max(32).optional(),
        description: z.string().trim().max(2000).optional(),
        desiredStoresNote: z.string().trim().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const existing = await db.getPendingApplicationForUser(ctx.user.id);
        if (existing) {
          throw new TRPCError({ code: "CONFLICT", message: "Ya tenés una solicitud pendiente" });
        }
        const id = await db.createVendorApplication({
          applicantUserId: ctx.user.id,
          companyName: input.companyName,
          contactName: input.contactName ?? null,
          contactPhone: input.contactPhone ?? null,
          description: input.description ?? null,
          desiredStoresNote: input.desiredStoresNote ?? null,
        });
        notifyOwner({
          title: "[Tulistica] Nueva solicitud de vendedor",
          content: `${ctx.user.email ?? "?"} → ${input.companyName}`,
        }).catch(() => {});
        return { applicationId: id };
      }),

    myStatus: protectedProcedure.query(async ({ ctx }) => {
      const app = await db.getLatestApplicationForUser(ctx.user.id);
      return { application: app ?? null };
    }),

    listPending: superAdminProcedure.query(() => db.listPendingApplications()),

    approve: superAdminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        reviewerNote: z.string().trim().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const app = await db.getVendorApplicationById(input.id);
        if (!app || app.status !== "pending") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Solicitud no encontrada o no pendiente" });
        }
        const applicant = await db.getUserById(app.applicantUserId);
        const brandId = await db.createBrand({
          companyName: app.companyName,
          email: applicant?.email ?? `vendor+${app.applicantUserId}@tulistica.local`,
          passwordHash: "",
          passwordSalt: "",
          emailVerified: true,
          contactName: app.contactName,
          status: "active",
          kind: "vendor",
        });
        if (!brandId) {
          throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "No se pudo crear la marca" });
        }
        await db.createBrandMember({
          brandId,
          userId: app.applicantUserId,
          membershipRole: "owner",
          acceptedAt: new Date(),
        });
        await db.promoteUserToVendorAdmin(app.applicantUserId);
        await db.markApplicationDecided({
          id: input.id,
          status: "approved",
          reviewerNote: input.reviewerNote,
          reviewedByUserId: ctx.user.id,
          resultingBrandId: brandId,
        });
        if (applicant?.email) {
          sendUserEmail({
            to: applicant.email,
            subject: "Tu solicitud de vendedor fue aprobada",
            body: `¡Felicitaciones! Tu marca "${app.companyName}" ya está activa en Tulistica.\n\nIngresá al portal: /brand/dashboard${input.reviewerNote ? `\n\nNota del equipo: ${input.reviewerNote}` : ""}`,
          }).catch(() => {});
        }
        return { brandId };
      }),

    reject: superAdminProcedure
      .input(z.object({
        id: z.number().int().positive(),
        reviewerNote: z.string().trim().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const app = await db.getVendorApplicationById(input.id);
        if (!app || app.status !== "pending") {
          throw new TRPCError({ code: "NOT_FOUND", message: "Solicitud no encontrada o no pendiente" });
        }
        await db.markApplicationDecided({
          id: input.id,
          status: "rejected",
          reviewerNote: input.reviewerNote,
          reviewedByUserId: ctx.user.id,
        });
        const applicant = await db.getUserById(app.applicantUserId);
        if (applicant?.email) {
          sendUserEmail({
            to: applicant.email,
            subject: "Tu solicitud de vendedor no fue aprobada",
            body: `Lamentablemente tu solicitud para "${app.companyName}" no avanzó.${input.reviewerNote ? `\n\nMotivo: ${input.reviewerNote}` : ""}\n\nPodés volver a aplicar cuando quieras desde /vendor/apply.`,
          }).catch(() => {});
        }
        return { ok: true };
      }),
  }),
```

If `z` isn't already imported at the top of `routers.ts`, add `import { z } from "zod";`. If `TRPCError` isn't already imported, add it: `import { TRPCError } from "@trpc/server";`.

- [ ] **Step 4: Run the tests**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm test server/vendor-applications.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run the full suite**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm test
```

Expected: 61 prior + new vendor-applications tests = 72 total. All pass.

- [ ] **Step 6: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add server/routers.ts server/vendor-applications.test.ts
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb status
```

Confirm exactly 2 files staged. Then:

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(vendor): vendorApplications router with apply/approve/reject"
```

---

## Task 4: VendorApply page

**Files:**
- Create: `client/src/pages/vendor/VendorApply.tsx`

**Strict file scope**: ONLY this one file.

- [ ] **Step 1: Create the file**

```tsx
import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Receipt } from "lucide-react";

export default function VendorApply() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const myStatus = trpc.vendorApplications.myStatus.useQuery(undefined, {
    enabled: !!user,
  });
  const applyMutation = trpc.vendorApplications.apply.useMutation();

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [description, setDescription] = useState("");
  const [desiredStoresNote, setDesiredStoresNote] = useState("");

  // If user already has a pending application, redirect to status page.
  useEffect(() => {
    if (myStatus.data?.application?.status === "pending") {
      navigate("/vendor/application", { replace: true });
    }
  }, [myStatus.data, navigate]);

  if (loading || myStatus.isLoading) {
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
            <CardTitle className="font-serif text-2xl">Iniciá sesión primero</CardTitle>
            <CardDescription>
              Para aplicar como vendedor necesitás una cuenta de Tulistica verificada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/sign-in?returnTo=/vendor/apply">
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
      await applyMutation.mutateAsync({
        companyName: companyName.trim(),
        contactName: contactName.trim() || undefined,
        contactPhone: contactPhone.trim() || undefined,
        description: description.trim() || undefined,
        desiredStoresNote: desiredStoresNote.trim() || undefined,
      });
      toast.success("Solicitud enviada");
      navigate("/vendor/application");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al enviar");
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
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Aplicá como vendedor</CardTitle>
            <CardDescription>
              Contanos sobre tu tienda. Revisamos cada solicitud manualmente y te respondemos por correo.
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
                  placeholder="Pulpería La Esquina"
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
                <Label htmlFor="contactPhone">Teléfono de contacto (opcional)</Label>
                <Input
                  id="contactPhone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+506 ..."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Sobre tu tienda (opcional)</Label>
                <Textarea
                  id="description"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="¿Qué vendés? ¿Hace cuánto operás?"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desiredStoresNote">¿Qué tiendas querés manejar? (opcional)</Label>
                <Textarea
                  id="desiredStoresNote"
                  rows={2}
                  value={desiredStoresNote}
                  onChange={(e) => setDesiredStoresNote(e.target.value)}
                  placeholder="Ej: Walmart Liberia, Mas x Menos Heredia"
                />
              </div>
              <Button type="submit" className="w-full" disabled={applyMutation.isPending}>
                {applyMutation.isPending ? "Enviando..." : "Enviar solicitud"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

If `@/components/ui/textarea` doesn't exist, check `client/src/components/ui/` with `ls`. If missing, run `npx shadcn@latest add textarea` from the worktree root. If shadcn is unavailable, substitute a plain `<textarea>` element with shared shadcn input classes.

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean.

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/pages/vendor/VendorApply.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb status
```

Confirm exactly 1 file staged. If `textarea` was added via shadcn it'll show too — that's expected if you needed it. Then:

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(vendor): VendorApply form page"
```

---

## Task 5: VendorApplicationStatus page

**Files:**
- Create: `client/src/pages/vendor/VendorApplicationStatus.tsx`

**Strict file scope**: ONLY this one file.

- [ ] **Step 1: Create the file**

```tsx
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Receipt, CheckCircle2, XCircle, Clock } from "lucide-react";

function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} día${days === 1 ? "" : "s"}`;
}

export default function VendorApplicationStatus() {
  const [, navigate] = useLocation();
  const { user, loading: userLoading } = useAuth();
  const myStatus = trpc.vendorApplications.myStatus.useQuery(undefined, {
    enabled: !!user,
  });

  if (userLoading || myStatus.isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </main>
    );
  }

  if (!user) {
    navigate("/sign-in?returnTo=/vendor/application", { replace: true });
    return null;
  }

  const app = myStatus.data?.application ?? null;

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
        <Card className="w-full max-w-xl">
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Tu solicitud de vendedor</CardTitle>
            <CardDescription>
              {app ? `Enviada ${timeAgo(app.createdAt)}` : "Todavía no aplicaste."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {!app && (
              <Link href="/vendor/apply">
                <Button className="w-full">Aplicar ahora</Button>
              </Link>
            )}

            {app?.status === "pending" && (
              <>
                <div className="flex items-center gap-3 rounded-lg border bg-amber-50 dark:bg-amber-950/30 p-4">
                  <Clock className="w-5 h-5 text-amber-700 dark:text-amber-300" />
                  <div>
                    <div className="font-medium">Estamos revisando tu solicitud</div>
                    <div className="text-sm text-muted-foreground">Te avisamos por correo cuando haya respuesta.</div>
                  </div>
                </div>
                <div className="space-y-2 text-sm">
                  <div><span className="text-muted-foreground">Marca:</span> <span className="font-medium">{app.companyName}</span></div>
                  {app.contactName && <div><span className="text-muted-foreground">Contacto:</span> {app.contactName}</div>}
                  {app.contactPhone && <div><span className="text-muted-foreground">Teléfono:</span> {app.contactPhone}</div>}
                  {app.description && <div><span className="text-muted-foreground">Descripción:</span> {app.description}</div>}
                  {app.desiredStoresNote && <div><span className="text-muted-foreground">Tiendas:</span> {app.desiredStoresNote}</div>}
                </div>
              </>
            )}

            {app?.status === "approved" && (
              <>
                <div className="flex items-center gap-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/30 p-4">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 dark:text-emerald-300" />
                  <div>
                    <div className="font-medium">¡Tu marca fue aprobada!</div>
                    <div className="text-sm text-muted-foreground">Ya podés entrar al portal de marcas.</div>
                  </div>
                </div>
                {app.reviewerNote && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Nota del equipo:</span> {app.reviewerNote}
                  </div>
                )}
                <Link href="/brand/dashboard">
                  <Button className="w-full">Ir al portal de marcas</Button>
                </Link>
              </>
            )}

            {app?.status === "rejected" && (
              <>
                <div className="flex items-center gap-3 rounded-lg border bg-red-50 dark:bg-red-950/30 p-4">
                  <XCircle className="w-5 h-5 text-red-700 dark:text-red-300" />
                  <div>
                    <div className="font-medium">Tu solicitud no fue aprobada</div>
                    <div className="text-sm text-muted-foreground">Podés volver a aplicar cuando quieras.</div>
                  </div>
                </div>
                {app.reviewerNote && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Motivo:</span> {app.reviewerNote}
                  </div>
                )}
                <Link href="/vendor/apply">
                  <Button variant="outline" className="w-full">Volver a aplicar</Button>
                </Link>
              </>
            )}

            {app && (
              <div className="text-xs text-muted-foreground text-right">
                <Badge variant="outline">{app.status}</Badge>
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
```

If `@/components/ui/badge` doesn't exist, add it via shadcn (`npx shadcn@latest add badge`) — same approach as Task 4.

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean.

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/pages/vendor/VendorApplicationStatus.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(vendor): VendorApplicationStatus page"
```

---

## Task 6: AdminVendorQueue page

**Files:**
- Create: `client/src/pages/admin/AdminVendorQueue.tsx`

**Strict file scope**: ONLY this one file.

- [ ] **Step 1: Create the file**

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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ArrowLeft, Receipt, Check, X } from "lucide-react";

type DialogState = { kind: "approve" | "reject"; appId: number; companyName: string } | null;

export default function AdminVendorQueue() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const utils = trpc.useUtils();
  const pendingQuery = trpc.vendorApplications.listPending.useQuery(undefined, {
    enabled: user?.role === "super_admin",
  });
  const approveMutation = trpc.vendorApplications.approve.useMutation({
    onSuccess: () => {
      toast.success("Aprobada");
      utils.vendorApplications.listPending.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });
  const rejectMutation = trpc.vendorApplications.reject.useMutation({
    onSuccess: () => {
      toast.success("Rechazada");
      utils.vendorApplications.listPending.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const [dialog, setDialog] = useState<DialogState>(null);
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

  const handleDecision = async () => {
    if (!dialog) return;
    const args = { id: dialog.appId, reviewerNote: note.trim() || undefined };
    if (dialog.kind === "approve") {
      await approveMutation.mutateAsync(args).catch(() => {});
    } else {
      await rejectMutation.mutateAsync(args).catch(() => {});
    }
    setDialog(null);
    setNote("");
  };

  const apps = pendingQuery.data ?? [];

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
        <div>
          <h1 className="font-serif text-3xl">Solicitudes de vendedor</h1>
          <p className="text-sm text-muted-foreground">
            {apps.length === 0 ? "No hay solicitudes pendientes." : `${apps.length} solicitud${apps.length === 1 ? "" : "es"} pendiente${apps.length === 1 ? "" : "s"}.`}
          </p>
        </div>

        <div className="space-y-4">
          {apps.map(app => (
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
                  <Button
                    size="sm"
                    onClick={() => { setDialog({ kind: "approve", appId: app.id, companyName: app.companyName }); setNote(""); }}
                  >
                    <Check className="w-4 h-4 mr-1" /> Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setDialog({ kind: "reject", appId: app.id, companyName: app.companyName }); setNote(""); }}
                  >
                    <X className="w-4 h-4 mr-1" /> Rechazar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Dialog open={!!dialog} onOpenChange={(open) => { if (!open) { setDialog(null); setNote(""); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {dialog?.kind === "approve" ? "Aprobar" : "Rechazar"} solicitud de {dialog?.companyName}
              </DialogTitle>
              <DialogDescription>
                {dialog?.kind === "approve"
                  ? "Se creará la marca y el aplicante recibirá un correo de confirmación."
                  : "El aplicante recibirá un correo con el motivo. Podrá volver a aplicar."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="reviewerNote">Nota (opcional)</Label>
              <Textarea
                id="reviewerNote"
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={dialog?.kind === "approve" ? "Bienvenida..." : "Motivo del rechazo..."}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialog(null); setNote(""); }}>Cancelar</Button>
              <Button onClick={handleDecision} disabled={approveMutation.isPending || rejectMutation.isPending}>
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}
```

If `@/components/ui/dialog` doesn't exist, add via `npx shadcn@latest add dialog`.

- [ ] **Step 2: Type-check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check
```

Expected: clean.

- [ ] **Step 3: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/pages/admin/AdminVendorQueue.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(admin): vendor application approval queue"
```

---

## Task 7: Wire routes + Dashboard pill

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/pages/Dashboard.tsx`

**Strict file scope**: ONLY these two files.

- [ ] **Step 1: Add routes in App.tsx**

Open `client/src/App.tsx`. Add three new imports near the other page imports:

```tsx
import VendorApply from "./pages/vendor/VendorApply";
import VendorApplicationStatus from "./pages/vendor/VendorApplicationStatus";
import AdminVendorQueue from "./pages/admin/AdminVendorQueue";
```

Add three new `<Route>` entries inside the router block (location doesn't matter — put them near the `/vendor/*` or `/admin/*` neighborhood if grouped, otherwise anywhere):

```tsx
<Route path="/vendor/apply" component={VendorApply} />
<Route path="/vendor/application" component={VendorApplicationStatus} />
<Route path="/admin/vendors" component={AdminVendorQueue} />
```

- [ ] **Step 2: Add pill to Dashboard**

Open `client/src/pages/Dashboard.tsx`. Find where `useAuth()` is called (around line 77, `const { user, loading, isAuthenticated } = useAuth();`).

Right after that, add:

```tsx
  const vendorStatus = trpc.vendorApplications.myStatus.useQuery(undefined, {
    enabled: !!user,
    staleTime: 60_000,
  });
```

If `trpc` isn't already imported in Dashboard, add `import { trpc } from "@/lib/trpc";` to the imports.

Find the verify-email banner mount point (the `<VerifyEmailBanner ... />` from Phase 2, around line 109 give or take — it's at the top of the dashboard render tree). Right BELOW that banner, add a small pill block:

```tsx
{vendorStatus.data?.application?.status === "pending" && (
  <Link href="/vendor/application">
    <div className="inline-flex items-center gap-2 rounded-full border bg-amber-50 dark:bg-amber-950/30 px-3 py-1 text-xs text-amber-900 dark:text-amber-200 hover:bg-amber-100">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Solicitud de vendedor: en revisión
    </div>
  </Link>
)}
{vendorStatus.data?.application?.status === "approved" && (
  <Link href="/brand/dashboard">
    <div className="inline-flex items-center gap-2 rounded-full border bg-emerald-50 dark:bg-emerald-950/30 px-3 py-1 text-xs text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
      ¡Sos vendedor! Ir al portal →
    </div>
  </Link>
)}
```

If `Link` isn't already imported from `wouter`, the Dashboard file already imports it (it's used elsewhere). Verify.

If `desc`/`asc` or other helpers needed by the pill aren't available, don't add them — keep the pill simple as above.

- [ ] **Step 3: Type-check + tests + build**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check && pnpm test && pnpm build 2>&1 | tail -8
```

Expected:
- `pnpm check`: clean.
- `pnpm test`: all pass.
- `pnpm build`: succeeds.

- [ ] **Step 4: Commit**

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb add client/src/App.tsx client/src/pages/Dashboard.tsx
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb status
```

Confirm exactly 2 files staged. Then:

```
git -C /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb commit -m "feat(vendor): wire vendor + admin routes, dashboard status pill"
```

---

# Final verification

- [ ] **Step 1: Full check**

```
cd /Users/joseleonsalgado/Documents/Mirror/Mirror/development/tulistica_web/tulistica_waze/.claude/worktrees/bold-allen-a3a0bb && pnpm check && pnpm test && pnpm build 2>&1 | tail -10
```

Expected:
- type-check clean
- all tests pass
- build succeeds
