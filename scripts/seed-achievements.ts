/**
 * Seed the default achievement badge ladder. Idempotent — safe to re-run.
 * Usage: pnpm tsx scripts/seed-achievements.ts
 */
import { ensureDefaultAchievements, getAchievements } from "../server/db";

async function main() {
  const inserted = await ensureDefaultAchievements();
  const all = await getAchievements();
  console.log(`Seeded ${inserted} new achievement(s). Total now: ${all.length}.`);
  for (const a of all) {
    console.log(`  - ${a.name} [${a.badgeType}] points>=${a.pointsRequired} reports>=${a.reportsRequired}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
