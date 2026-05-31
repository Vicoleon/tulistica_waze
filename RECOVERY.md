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

## Continue on a different computer

```bash
git clone https://github.com/Vicoleon/tulistica_waze.git
cd tulistica_waze
git fetch --all --tags
git checkout claude/gallant-chatelet-38ff0b
cp .env.template .env   # MOCK_AUTH=true is already set
pnpm install
pnpm dev                # http://localhost:3001/
```

That gets you back to the fully-merged working state with Andrea Solano logged in and mock CR stores/products populated.

## With a real MySQL database

If you have the `grocery-waze-db` Docker container (or any MySQL):

```bash
# 1. point .env at the real DB
# DATABASE_URL="mysql://root:grocerywaze@localhost:3307/grocery_waze"

# 2. apply schema migrations
pnpm drizzle-kit migrate

# 3. if you get the 'redesign brands schema' from an older session, reconcile:
docker exec -i grocery-waze-db mysql -uroot -pgrocerywaze < scripts/reconcile-db-2026-05-25.sql

# 4. make sure user id=1 exists (or whatever the MOCK_AUTH user id is)
docker exec grocery-waze-db mysql -uroot -pgrocerywaze -e \
  "INSERT INTO grocery_waze.users (id, openId, name, email, role) VALUES (1, 'user_...', 'Andrea Solano', 'andrea@tulistica.cr', 'admin') ON DUPLICATE KEY UPDATE name=VALUES(name)"

# 5. seed Costa Rica stores + products
pnpm tsx scripts/seed-minimal.ts
```

When DATABASE_URL points to a working MySQL with user id=1, MOCK_AUTH reads
that real user from the DB (including saved shopperProfile), so onboarding,
list mutations, and price reports all persist properly.

If you also want the other session's in-progress work (vendor + store claims), pull those branches too:

```bash
git checkout claude/bold-allen-a3a0bb            # 10 newer commits, vendor/store-claim work
# To re-create the uncommitted edits that were sitting in that worktree:
git cherry-pick --no-commit backup/bold-allen-wip-2026-05-25
git reset HEAD                                    # back to "modified but unstaged" state
```

## Branch map on origin

| Branch | Tip | What it has |
|---|---|---|
| `claude/gallant-chatelet-38ff0b` | `faff90a` | The full merged state. Use this. |
| `claude/thirsty-sinoussi-051392` | `4558b84` | Rescue commit of the redesign (Cocina+Pastel theme, design spec, mockups). Already merged into gallant-chatelet. |
| `claude/angry-engelbart-0ebbdc` | `e4e18a3` | Rescue commit of admin/scrapers/vault/devAuth/localAuth/legal pages/migrations 0004-0008. Already merged into gallant-chatelet. |
| `main` | `1f38eb4` | Public main + the auth/role-model cleanup merged from bold-allen. Now fully on origin. |
| `claude/bold-allen-a3a0bb` | `d5c80ef` | Other session's branch — has 10 vendor/store-claim/brand-portal-rebuild commits beyond what's on `main`. NOT merged into gallant-chatelet — reconcile manually if you want them. |
| `backup/bold-allen-wip-2026-05-25` | `05aa1ae` | Snapshot of the uncommitted edits that were sitting in the bold-allen worktree. Use `git cherry-pick --no-commit` then `git reset HEAD` to restore them as unstaged edits. |
| `backup/laughing-nightingale-wip-2026-05-25` | `57b6356` | Same brand-portal work that's already on main as c02ee38 — backed up here just in case. |

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

## Adding more physical stores (Google Places)

The seed has 8 physical stores around the San José metro area, plus 6
delivery-only "(en línea)" stores that are excluded from distance-based
queries. To populate all of Costa Rica (15 cities × all grocery chains):

```bash
# 1. Get a Google Maps API key with Places API enabled
#    https://console.cloud.google.com/apis/library/places-backend.googleapis.com
# 2. Add it to .env (which is gitignored):
GOOGLE_MAPS_API_KEY="AIza..."
# Alternative: BUILT_IN_FORGE_API_URL + BUILT_IN_FORGE_API_KEY if proxying
# through Manus's Forge.

# 3. Run the seed (covers San José, Escazú, Santa Ana, Heredia, Alajuela,
#    Cartago, Liberia, Puntarenas, Limón, San Pedro, Curridabat, Tibás,
#    Moravia, Guadalupe, Desamparados):
pnpm tsx scripts/seed-costa-rica.ts
```

The script is at `scripts/seed-costa-rica.ts` and uses the makeRequest
helper in `server/_core/map.ts`. After it runs, physical stores will
dominate distance-based queries.

## What's outstanding

- `main` has ~50 commits of parallel work (vendor onboarding, store claims,
  brand cookie deprecation, /sign-in canonical page, email verification,
  password reset, role enum widening). It also has uncommitted in-progress
  edits in the main worktree. Decide manually whether to merge that into
  this branch — it will conflict heavily and needs a careful review.
- Tests: 31/31 pass. Typecheck clean.
- No data is lost: every uncommitted worktree was committed as `wip:` and
  pushed to origin before any destructive operation.
