# Tulistica — Recovery & Branch Map

## ⭐ Safe snapshot

**Tag:** `tulistica-everything-merged-2026-05-25`
**Commit:** `faff90a`
**On GitHub:** https://github.com/Vicoleon/tulistica_waze/releases/tag/tulistica-everything-merged-2026-05-25

This snapshot has **everything working in MOCK_AUTH mode without a database**:
the redesign, the brand portal, budget tracker, seasonal deals, admin LLM
config, scrapers, vault, devAuth, onboarding fix, Andrea Solano mock user,
and the in-memory mock data layer (8 stores, 12 products, demo list).

## Restore from anywhere

```bash
git fetch origin
git checkout tulistica-everything-merged-2026-05-25
# or: git checkout claude/gallant-chatelet-38ff0b for the live branch
pnpm install
pnpm dev   # http://localhost:3001/
```

## Branch map on origin

| Branch | Tip | What it has |
|---|---|---|
| `claude/gallant-chatelet-38ff0b` | `faff90a` | The full merged state. Use this. |
| `claude/thirsty-sinoussi-051392` | `4558b84` | Rescue commit of the redesign (Cocina+Pastel theme, design spec, mockups). Already merged into gallant-chatelet. |
| `claude/angry-engelbart-0ebbdc` | `e4e18a3` | Rescue commit of admin/scrapers/vault/devAuth/localAuth/legal pages/migrations 0004-0008. Already merged into gallant-chatelet. |
| `main` | `1f38eb4`+ | Has parallel work from another session (vendor onboarding, store claims, brand_members refactor) that has NOT been merged into gallant-chatelet. Reconcile carefully. |

## Commit history on `claude/gallant-chatelet-38ff0b`

```
faff90a feat(mock): in-memory store/product/list fixtures for no-DB demos
0a91134 fix: replace 'Mock User' with a real Costa Rican name in MOCK_AUTH mode
1f5899d fix: persist onboarding answers in MOCK_AUTH mode to stop redirect loop
b9b7053 chore: bump preview launch port to 3001 to avoid host process conflict
c1fa706 Merge angry-engelbart: admin LLM config, scrapers, dev auth, legal pages, vault
e4e18a3 wip: rescued angry-engelbart work
b55e982 Merge redesign: Cocina+Pastel design system + brand portal + my features
4558b84 wip: rescued redesign — Cocina+Pastel theme, all pages, design spec, mockups
adf1575 Merge branch 'main' — brand portal + mock auth
55cce42 feat: add budget tracker, seasonal deals, fix optimize button, rebrand to Tulistica
```

## Running it

The dev `.env` ships with `MOCK_AUTH="true"` and no DATABASE_URL — that's
intentional. The mock layer fills in stores, products, lists, prices, and
user prefs from process memory so the UI is fully populated.

Mock identity is **Andrea Solano** (`andrea@tulistica.cr`, role `admin`).
Override via `MOCK_USER_NAME` / `MOCK_USER_EMAIL` env vars.

For real persistence: point `DATABASE_URL` at MySQL, run `pnpm db:push`,
then `pnpm tsx scripts/seed-minimal.ts` to seed the same 8 stores + 12
products.

## What's outstanding

- `main` has ~50 commits of parallel work (vendor onboarding, store claims,
  brand cookie deprecation, /sign-in canonical page, email verification,
  password reset, role enum widening). It also has uncommitted in-progress
  edits in the main worktree. Decide manually whether to merge that into
  this branch — it will conflict heavily and needs a careful review.
- Tests: 31/31 pass. Typecheck clean.
- No data is lost: every uncommitted worktree was committed as `wip:` and
  pushed to origin before any destructive operation.
