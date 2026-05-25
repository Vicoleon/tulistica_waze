# Store Claiming — Design Spec

**Status:** Approved, ready for implementation planning
**Date:** 2026-05-25
**Scope:** Slice C1 of Phase 3. Lets a vendor's owner/admin claim ownership of one or more `stores` rows. Super-admin approves; approval sets `stores.brandId`. Staff invites (C2) and store-level analytics (C3) are separate follow-on specs.

**Prior specs:**
- [2026-05-25-auth-and-role-model-design.md](2026-05-25-auth-and-role-model-design.md)
- [2026-05-25-brand-cookie-deprecation-design.md](2026-05-25-brand-cookie-deprecation-design.md)
- [2026-05-25-vendor-onboarding-design.md](2026-05-25-vendor-onboarding-design.md)

---

## 1. Problem

Phase 3-B's vendor onboarding produces a `brands` row with `kind='vendor'` and a `brand_members` owner row — but the vendor has no actual stores yet. The existing `stores.brandId` column (Phase 1, migration 0009) is the link, but no flow populates it. Vendors can't see or manage anything store-specific until claims work, and store-level analytics (C3) has nothing to analyze.

## 2. Goals / Non-goals

**Goals**
- Vendor owner/admin can search for an unclaimed store (by name + city) and submit a claim with a free-text justification.
- Super-admin sees a queue of pending claims (in a new tab on the existing `/admin/vendors` page) and approves or rejects with an optional note.
- On approval: `stores.brandId` is set, claim row marked approved, claimant notified via `sendUserEmail` (dev stub).
- Vendor can see their active stores AND their pending/decided claims on a `/brand/stores` page.
- Vendor admin can re-claim a rejected store (rejection doesn't permanently block).
- Race protection: if a store gets claimed between vendor submitting and admin approving, the admin's approval fails with CONFLICT (first approval wins).

**Non-goals (deferred)**
- File-upload proof (business cert, lease, etc.) — free-text only for MVP.
- Per-store dashboards / analytics — Subsystem C3.
- Staff invites — Subsystem C2.
- Transferring an already-claimed store to a different brand — manual operator process.
- "Request a store be added that's not in our DB" — vendors can only claim stores that already exist (from the scraper or seed).
- Bulk claim (claim multiple stores at once with one decision) — one-at-a-time for MVP.

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Verification | Free-text justification + super-admin manual review | MVP-appropriate. No file-upload infra. |
| Review surface | Tab on the existing `/admin/vendors` page | One admin queue, not two pages to remember. |
| Already-claimed in search | Hidden | Simpler UX, no abuse nudges. |
| Storage | New `store_claims` table | Audit trail, separates pending state from `stores`. |
| Pending-per-pair constraint | One pending claim per `(brandId, storeId)` | App-layer check (no SQL constraint — allows re-claim after rejection). |
| Approval auth | `superAdminProcedure` | Same as vendor application approval. |
| Claim creation auth | `vendorAdminProcedure` | Owner/admin only — staff can't bind the brand to new stores. |
| View auth (search/myClaims/myStores) | `vendorStaffProcedure` | Any team member can browse. |

## 4. Schema

One migration `drizzle/0012_store_claims.sql`:

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

Drizzle `schema.ts` gets a `storeClaims` table export + `StoreClaim` / `InsertStoreClaim` types. `stores` table is unchanged — the existing `brandId` column from migration 0009 is the target.

## 5. Server

### 5.1 `server/db.ts` helpers

```ts
export async function createStoreClaim(data: InsertStoreClaim): Promise<number | null>;
export async function getPendingClaimForBrandStore(brandId: number, storeId: number): Promise<StoreClaim | undefined>;
export async function getStoreClaimById(id: number): Promise<StoreClaim | undefined>;
export async function listPendingStoreClaims(): Promise<Array<StoreClaim & { brand: Brand; store: Store }>>;
export async function listStoreClaimsForBrand(brandId: number): Promise<Array<StoreClaim & { store: Store }>>;
export async function listStoresForBrand(brandId: number): Promise<Store[]>;
export async function searchUnclaimedStores(opts: { query?: string; city?: string; limit?: number }): Promise<Store[]>;
export async function markStoreClaimDecided(opts: { id: number; status: 'approved'|'rejected'; reviewerNote?: string; reviewedByUserId: number }): Promise<void>;
export async function linkStoreToBrand(storeId: number, brandId: number): Promise<void>;
export async function getStoreById(id: number): Promise<Store | undefined>;
```

`searchUnclaimedStores` filters `stores.brandId IS NULL`, matches `name LIKE ?` and optional `city LIKE ?`, defaults limit to 50.

`getStoreById` may already exist — check before adding. If yes, reuse.

### 5.2 tRPC `storeClaims` sub-router

| Procedure | Auth | Behavior |
|---|---|---|
| `search({ query?, city? })` | `vendorStaffProcedure` | Returns up to 50 unclaimed stores matching the filters. |
| `myClaims` | `vendorStaffProcedure` | Returns all claims (any status) for the active brand. |
| `myStores` | `vendorStaffProcedure` | Returns all stores where `brandId = ctx.brand.id`. |
| `claim({ storeId, justification? })` | `vendorAdminProcedure` | Validates store exists, isn't already claimed, no existing pending claim from the brand. Inserts claim. `notifyOwner` fire-and-forget. |
| `listPending` | `superAdminProcedure` | All pending claims with joined brand + store info. |
| `approve({ id, reviewerNote? })` | `superAdminProcedure` | **Race-protected**: re-fetches store, fails CONFLICT if `brandId` is set. On success: `linkStoreToBrand` + `markStoreClaimDecided` + applicant email. |
| `reject({ id, reviewerNote? })` | `superAdminProcedure` | Marks claim rejected. Does NOT touch `stores.brandId`. Applicant email. |

All procedures live on `appRouter.storeClaims`.

### 5.3 Notifications

Same pattern as Phase 3-B:
- Submission → `notifyOwner({ title: '[Tulistica] Nueva reclamación de tienda', content: ... })`
- Decision → `sendUserEmail({ to: claimantEmail, subject: ..., body: ... })`

Both fire-and-forget (`.catch(() => {})`). Reuse the existing dev stubs.

## 6. Client — Vendor UI

### 6.1 `/brand/stores`

"Mis tiendas" page wrapped in `BrandLayout`. Two sections stacked vertically:

**Tiendas activas** — reads `storeClaims.myStores`. Each row shows:
- Store name (h3)
- Address + city
- Placeholder text: "Próximamente: panel por tienda" (analytics is C3)

If empty, shows a CTA: "Aún no tenés tiendas. [Reclamar tu primera tienda →]" linking to `/brand/stores/claim`.

**Reclamaciones** — reads `storeClaims.myClaims`. Each row shows:
- Store name
- Status badge (pending / approved / rejected)
- Reviewer note (if any)
- "Submitted X days ago"

Rejected claims show a "Volver a reclamar" button → `/brand/stores/claim?storeId=…` (pre-populates the picker).

### 6.2 `/brand/stores/claim`

"Reclamar tienda" page wrapped in `BrandLayout`.

Top: search bar with two inputs (name + city). Submits to `storeClaims.search`. Results render as a card list (max 50 items).

Each result card: store name, address, city, "Reclamar" button. Clicking opens a dialog:
- Title: "Reclamar {store name}"
- Description: "Contanos por qué sos el dueño de esta tienda. Un super-admin revisa cada reclamación."
- Textarea: justification (optional, max 2000 chars)
- Cancel / Confirmar

On Confirmar: `storeClaims.claim.mutate({ storeId, justification })`. On success, toast + redirect to `/brand/stores` (where the new claim shows in the "Reclamaciones" section as pending).

### 6.3 BrandLayout sidebar

Add a "Stores" item between "Campaigns" and "Billing":

```ts
{ href: "/brand/stores", label: "Stores", icon: Store /* lucide */ },
```

## 7. Client — Admin UI

Refactor `client/src/pages/admin/AdminVendorQueue.tsx`:

- Rename to `AdminQueue` (or add a wrapper component) with a tab strip at the top:
  - **Solicitudes de vendedor** (existing content)
  - **Reclamaciones de tienda** (new)
- Each tab shows the pending-count as a Badge.
- Default tab: whichever has pending items first (or "Solicitudes de vendedor" if both have items / both empty).

**Store-claims tab** renders cards per pending claim:
- Store name + address + city
- Brand name (claimant brand)
- Claimant user (name / email)
- Justification text (if any)
- Approve / Reject buttons opening the same note dialog as vendor applications.

Use the same approve/reject dialog component from Phase 3-B if reasonable; otherwise duplicate the small dialog logic — both are small.

## 8. Rollout

Single PR, ordered commits:

1. Migration 0012 + schema.ts updates
2. db.ts helpers (~9 new functions; check `getStoreById` doesn't already exist)
3. tRPC `storeClaims` router + tests
4. App.tsx routes (`/brand/stores`, `/brand/stores/claim`)
5. BrandLayout sidebar "Stores" item
6. `/brand/stores` page (My Stores + My Claims)
7. `/brand/stores/claim` page (search + claim dialog)
8. Admin queue refactor: tabbed AdminQueue with vendor-applications + store-claims tabs
9. Final verification (`pnpm check && pnpm test && pnpm build`)

## 9. Testing

**Vitest unit + integration tests:**

For `claim`:
- Rejects when caller is `vendor_staff` (FORBIDDEN — only `vendor_admin`/owner)
- Rejects when no active brand on ctx (BAD_REQUEST)
- Rejects when store doesn't exist (NOT_FOUND)
- Rejects when store is already claimed (CONFLICT)
- Rejects when brand has a pending claim for the same store (CONFLICT)
- Happy path: inserts claim, returns claimId

For `approve`:
- Rejects non-super-admin (FORBIDDEN)
- Rejects non-pending claim (NOT_FOUND)
- **Race**: rejects when the store became claimed between submission and approval (CONFLICT)
- Happy path: calls `linkStoreToBrand`, marks decided, calls applicant email

For `reject`:
- Rejects non-super-admin (FORBIDDEN)
- Rejects non-pending claim
- Marks rejected, does NOT touch `stores.brandId`, does NOT call `linkStoreToBrand`

For `search`:
- Filters out claimed stores
- Honors limit (default 50)
- Matches query against store name (case-insensitive)

For `myStores` / `myClaims`:
- Returns only rows for the active brand
- Empty array for brands with no stores/claims

## 10. Open questions

- **Multi-store batch claim**: not in scope. If a vendor has a chain of 10 stores, they file 10 individual claims. Tolerable for MVP; revisit if it becomes painful.
- **Per-store dashboards / analytics**: deferred to C3. The "Mis tiendas" page has a placeholder ("Próximamente: panel por tienda") on each store row.
- **Conflict resolution UI**: if a vendor's claim is rejected because someone else got approved first (the race-protected approve path), the rejected-state message just says "ya fue reclamada". They can dispute via human contact — no in-app dispute flow.
