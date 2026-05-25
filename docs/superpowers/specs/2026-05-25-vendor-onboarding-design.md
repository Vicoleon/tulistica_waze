# Vendor Onboarding — Design Spec

**Status:** Approved, ready for implementation planning
**Date:** 2026-05-25
**Scope:** Subsystem B of Phase 3. Adds a "become a vendor" application flow + super-admin approval queue. Approval creates a vendor brand and promotes the applicant to `vendor_admin`. Store-claim/management lives in Subsystem C.

**Prior specs:**
- [2026-05-25-auth-and-role-model-design.md](2026-05-25-auth-and-role-model-design.md)
- [2026-05-25-brand-cookie-deprecation-design.md](2026-05-25-brand-cookie-deprecation-design.md)

---

## 1. Problem

Phase 1+2 introduced the role taxonomy (`consumer`/`vendor_staff`/`vendor_admin`/`super_admin`) but provided no flow to *become* a vendor. Phase 3-A unified brand auth onto `brand_members` but new brands can only be created by self-service `brandAuth.register` (which makes an `advertiser` brand). There is no path for a real Costa Rican grocery store owner to apply to be a vendor on Tulistica and get approved by the platform.

## 2. Goals / Non-goals

**Goals**
- Logged-in consumer can submit a vendor application form.
- Super-admin sees a pending-applications queue, can approve or reject each with an optional note.
- On approval: a `brands` row with `kind='vendor'` is created, a `brand_members` row owner-promotes the applicant, and `users.role` is bumped to `vendor_admin` if currently `consumer`.
- Applicant has a dedicated status page showing pending / approved / rejected (+note).
- Applicant can reapply after a rejection.
- Notifications: `notifyOwner` fires on submission; `sendUserEmail` fires on decision (using the existing dev stub).

**Non-goals (deferred)**
- Store claiming (which physical store does this vendor own?) — Subsystem C.
- Staff invites — Subsystem C.
- Vendor admin dashboard / store management UI — Subsystem C.
- Production email transport.
- Multi-state review (`under_review`, `needs_info`, comment threads). This spec uses three terminal states only: pending → approved | rejected.
- Bulk-import vendor approval (e.g., partner deals approving many at once). Future spec if needed.

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Application storage | Separate `vendor_applications` table | Clean separation: application data lives apart from the active `brands` row. Approved/rejected apps stay as historical audit trail. |
| Store claiming during application | Optional free-text note only; real claim in C | Keeps B focused on the approval gate. The application can hint at intent ("I want to manage the Liberia Walmart") but no `stores.brandId` is set here. |
| Approval workflow | Approve/Reject with optional note | Minimal sufficient. Note is stored on the application and included in the applicant notification. |
| Applicant status surface | Dedicated `/vendor/application` page | Works even when email is stubbed. Page polls the procedure on mount. |
| Notifications | Reuse `notifyOwner` for submit, `sendUserEmail` for decision | Same transport as everything else. Production email is a separate infra task. |
| Pending-application constraint | One per user (app-layer check, not SQL) | Allows rejected applicants to reapply by submitting a new row. |

## 4. Schema

One migration `drizzle/0011_vendor_applications.sql`:

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

Drizzle `schema.ts` gets a matching table export:

```ts
export const vendorApplications = mysqlTable("vendor_applications", {
  id: int("id").autoincrement().primaryKey(),
  applicantUserId: int("applicantUserId").notNull(),
  companyName: varchar("companyName", { length: 255 }).notNull(),
  contactName: varchar("contactName", { length: 255 }),
  contactPhone: varchar("contactPhone", { length: 32 }),
  description: text("description"),
  desiredStoresNote: text("desiredStoresNote"),
  status: mysqlEnum("status", ["pending","approved","rejected"]).default("pending").notNull(),
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

## 5. Server

### 5.1 `server/db.ts` helpers

```ts
export async function createVendorApplication(data: InsertVendorApplication): Promise<number | null>;
export async function getPendingApplicationForUser(userId: number): Promise<VendorApplication | undefined>;
export async function getLatestApplicationForUser(userId: number): Promise<VendorApplication | undefined>;
export async function listPendingApplications(): Promise<VendorApplication[]>;
export async function getVendorApplicationById(id: number): Promise<VendorApplication | undefined>;
export async function markApplicationDecided(opts: {
  id: number;
  status: 'approved' | 'rejected';
  reviewerNote?: string;
  reviewedByUserId: number;
  resultingBrandId?: number;
}): Promise<void>;
export async function promoteUserToVendorAdmin(userId: number): Promise<void>;
```

`promoteUserToVendorAdmin` semantics: only updates `users.role` if it is currently `'consumer'`. `super_admin` and existing `vendor_admin` / `vendor_staff` are left untouched.

### 5.2 tRPC router

New `vendorApplications` sub-router on `appRouter` (in `server/routers.ts`):

| Procedure | Auth | Behavior |
|---|---|---|
| `apply` | `verifiedProcedure` | Reject if user has a pending app. Insert new row. `notifyOwner` fire-and-forget. Return `{ applicationId }`. |
| `myStatus` | `protectedProcedure` | Return `{ application: VendorApplication \| null }`. Returns the LATEST application (status doesn't matter), so the page can show history. |
| `listPending` | `superAdminProcedure` | Return all `status='pending'` apps with applicant email/name joined (or as separate field). |
| `approve` | `superAdminProcedure` | Validate `status='pending'`. Create brand (kind=vendor), brand_members (owner), promote user, mark application approved with `resultingBrandId`. Fire `sendUserEmail` to applicant. |
| `reject` | `superAdminProcedure` | Validate `status='pending'`. Mark application rejected with `reviewerNote`. Fire `sendUserEmail` to applicant. |

`approve` uses the same brand-creation pattern as `brandAuth.register` (from Phase 3-A) but with `kind: "vendor"` and `email` derived from the applicant's `users.email`.

### 5.3 Notification helpers

Reuse what exists:
- Submission → `notifyOwner({ title: '[Tulistica] Nueva solicitud de vendedor', content: ... })`
- Decision → `sendUserEmail({ to: applicantEmail, subject: ..., body: ... })`

Both calls are fire-and-forget (`.catch(() => {})`). They do not block the response.

## 6. Client

### 6.1 New pages

**`client/src/pages/vendor/VendorApply.tsx`** — form, route `/vendor/apply`.

Fields: companyName (required), contactName, contactPhone, description, desiredStoresNote. On submit: `trpc.vendorApplications.apply.mutate(...)` → redirect to `/vendor/application`. Pre-flight check: if the page loads and the user already has a pending application (`myStatus.application.status === 'pending'`), redirect to `/vendor/application` instead of showing the form.

**`client/src/pages/vendor/VendorApplicationStatus.tsx`** — route `/vendor/application`.

Reads `trpc.vendorApplications.myStatus`. Renders one of four UIs:
- `null` → "Todavía no aplicaste" CTA → `Link to /vendor/apply`
- `pending` → "Estamos revisando tu solicitud" + read-only view of the submitted fields + "submitted X days ago"
- `approved` → success card with link to `/brand/dashboard`
- `rejected` → rejection card + `reviewerNote` (if any) + "Volver a aplicar" button → `Link to /vendor/apply`

**`client/src/pages/admin/AdminVendorQueue.tsx`** — route `/admin/vendors`.

Reads `trpc.vendorApplications.listPending`. Renders a list of cards, each with:
- Applicant name + email
- Company name + contact info + description + desiredStoresNote
- Submitted timestamp
- Approve / Reject buttons, each opening a small dialog with an optional reviewer note field

Page-level guard: super-admin only. If `user.role !== 'super_admin'`, redirect to `/dashboard`.

### 6.2 App.tsx route wiring

```tsx
<Route path="/vendor/apply" component={VendorApply} />
<Route path="/vendor/application" component={VendorApplicationStatus} />
<Route path="/admin/vendors" component={AdminVendorQueue} />
```

### 6.3 Dashboard pill (light touch)

`client/src/pages/Dashboard.tsx` — small addition. If `myStatus.application?.status === 'pending'`, render a small pill near the top: *"Solicitud de vendedor: en revisión"* linking to `/vendor/application`. If `'approved'`, render a celebration pill: *"¡Sos vendedor en Tulistica! Ir al portal →"* linking to `/brand/dashboard`. If `'rejected'`, no pill (the user can find it in their profile/settings if needed — keep dashboard noise low).

## 7. Rollout

Single PR. Ordered commits:

1. Migration 0011 + schema.ts updates
2. db.ts helpers + tests
3. tRPC `vendorApplications` router + tests
4. App.tsx routes
5. VendorApply form page
6. VendorApplicationStatus page
7. AdminVendorQueue page
8. Dashboard pill
9. Final verification (`pnpm check && pnpm test && pnpm build`)

## 8. Testing

**Vitest unit + integration tests:**
- `apply` rejects when user already has a pending application (CONFLICT)
- `apply` rejects unverified users (FORBIDDEN — comes from `verifiedProcedure`)
- `apply` rejects unauthenticated requests (UNAUTHORIZED)
- `approve` creates a `brands` row with `kind='vendor'`, creates `brand_members` with `membershipRole='owner'`, promotes user role consumer→vendor_admin, marks application `approved`
- `approve` does NOT downgrade super_admin role
- `approve` rejects when application is not pending (NOT_FOUND or BAD_REQUEST)
- `approve` rejects when caller is not super_admin (FORBIDDEN)
- `reject` marks application rejected with reviewerNote; does not touch users.role or create a brand
- `myStatus` returns null when user has no applications
- `myStatus` returns the latest application regardless of status
- `listPending` only returns `status='pending'` rows; rejects non-super-admin

**Manual smoke (PR review):**
- Sign up as a new consumer → verify → apply via `/vendor/apply`
- Switch to super_admin (env-based) → hit `/admin/vendors` → approve
- Switch back to applicant → `/vendor/application` shows approved → click through to `/brand/dashboard` (which uses Phase 3-A's brand-switcher; should now show the new vendor brand)

## 9. Open questions

- **Role downgrade on rejection**: if a user is currently `vendor_admin` because of another brand and reapplies for a second brand which gets rejected, their role stays `vendor_admin` (untouched). That's correct — rejection only affects the application, not existing memberships.
- **Soft-delete vs hard-delete of withdrawn applications**: out of scope. Applicants cannot withdraw an application in this spec; only the super-admin can decide. If withdrawal is needed later, add a third terminal state `withdrawn`.
- **Notification body content**: deliberately terse in this spec. Implementation may flesh out the message templates as part of T4 (notification wiring).
