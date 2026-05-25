/**
 * CLI runner for chain scrapers.
 *
 * Usage:
 *   pnpm tsx scripts/run-scraper.ts <chain> [--limit N] [--delay MS]
 *   pnpm tsx scripts/run-scraper.ts all      [--limit N]
 *
 * Examples:
 *   pnpm tsx scripts/run-scraper.ts walmart --limit 500
 *   pnpm tsx scripts/run-scraper.ts all --limit 1000
 */

import "dotenv/config";
import { SCRAPERS } from "../server/scrapers/registry";

function parseArgs(argv: string[]): { chain: string; limit: number; delay?: number } {
  const args = argv.slice(2);
  const chain = args[0];
  if (!chain) {
    printUsage();
    process.exit(1);
  }
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1] ?? "1000", 10) : 1000;
  const delayIdx = args.indexOf("--delay");
  const delay = delayIdx >= 0 ? parseInt(args[delayIdx + 1] ?? "0", 10) : undefined;
  return { chain, limit, delay };
}

function printUsage() {
  console.error(`Usage: pnpm tsx scripts/run-scraper.ts <chain> [--limit N] [--delay MS]
Chains: ${Object.keys(SCRAPERS).join(", ")}, all`);
}

async function main() {
  const { chain, limit, delay } = parseArgs(process.argv);
  const chainsToRun = chain === "all" ? Object.keys(SCRAPERS) : [chain];

  for (const c of chainsToRun) {
    const entry = SCRAPERS[c];
    if (!entry) {
      console.error(`Unknown chain: ${c}. Available: ${Object.keys(SCRAPERS).join(", ")}`);
      process.exit(1);
    }
    console.log(`\n🛒 Scraping ${entry.name} (limit ${limit})...`);
    const started = Date.now();
    try {
      const stats = await entry.runner({ limit, delayMs: delay });
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      console.log(
        `✅ ${entry.name}: parsed ${stats.parsed} · upserted ${stats.upserted} · errors ${stats.errors} (${seconds}s)`
      );
    } catch (err) {
      console.error(`❌ ${entry.name} failed:`, err);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
