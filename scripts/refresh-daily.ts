/**
 * Daily refresh runner.
 *
 * Runs every working scraper (currently: Walmart, MaxiPalí, Más x Menos)
 * sequentially with per-chain error isolation — if one chain fails, the
 * others still run. Exits 0 if at least one chain succeeded.
 *
 * Designed to be invoked from cron / launchd / GitHub Actions.
 *
 *   pnpm refresh                # use defaults
 *   pnpm refresh --limit 2400   # override per-chain limit
 *
 * Scheduling examples are documented in docs/scraping.md.
 */

import "dotenv/config";
import { SCRAPERS } from "../server/scrapers/registry";

// Chains we know work reliably without extra setup.
//
// VTEX chains (Walmart, MaxiPalí, Más x Menos) hit their JSON catalog API and
// run in ~50s each at limit 2400. MegaSuper uses Playwright on SSR'd Instaleap
// pages — ~7 products/s, ~5min at limit 2500. PriceSmart uses Playwright with
// stealth on a Nuxt SPA (sitemap has 11.5k entries; ~50% stale, ~10% out-of-
// stock; limit 2000 yields ~800-900 live products in ~30min). AM uses
// Playwright + Ver Más pagination and is slowest (~30-40min at limit 1000).
// Order: fast → slow so a slow/failing chain at the end doesn't block others.
const DAILY_CHAINS: ReadonlyArray<{ chain: string; limit?: number }> = [
  { chain: "walmart" },
  { chain: "maxipali" },
  { chain: "masxmenos" },
  { chain: "megasuper", limit: 2500 },
  { chain: "pricesmart", limit: 2000 },
  { chain: "automercado", limit: 1000 },
];

interface RunResult {
  chain: string;
  status: "ok" | "error";
  parsed: number;
  upserted: number;
  errors: number;
  durationSeconds: number;
  errorMessage?: string;
}

function parseLimit(): number {
  const i = process.argv.indexOf("--limit");
  if (i >= 0) {
    const n = parseInt(process.argv[i + 1] ?? "", 10);
    if (!Number.isNaN(n) && n > 0) return n;
  }
  return 2400;
}

async function main() {
  const limit = parseLimit();
  const startedAt = new Date();
  console.log(`[refresh] starting daily refresh at ${startedAt.toISOString()} (limit ${limit}/chain)`);

  const results: RunResult[] = [];
  for (const { chain, limit: chainLimit } of DAILY_CHAINS) {
    const entry = SCRAPERS[chain];
    if (!entry) {
      console.warn(`[refresh] unknown chain "${chain}" — skipping`);
      continue;
    }
    const effectiveLimit = chainLimit ?? limit;
    const begin = Date.now();
    console.log(`[refresh] -> ${entry.name} (limit ${effectiveLimit})`);
    try {
      const stats = await entry.runner({ limit: effectiveLimit });
      const duration = (Date.now() - begin) / 1000;
      results.push({
        chain,
        status: "ok",
        parsed: stats.parsed,
        upserted: stats.upserted,
        errors: stats.errors,
        durationSeconds: duration,
      });
      console.log(
        `[refresh]    ✓ parsed ${stats.parsed} · upserted ${stats.upserted} · errors ${stats.errors} (${duration.toFixed(1)}s)`
      );
    } catch (err) {
      const duration = (Date.now() - begin) / 1000;
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        chain,
        status: "error",
        parsed: 0,
        upserted: 0,
        errors: 1,
        durationSeconds: duration,
        errorMessage: msg,
      });
      console.error(`[refresh]    ✗ ${entry.name} failed after ${duration.toFixed(1)}s: ${msg}`);
    }
  }

  const totalUpserted = results.reduce((s, r) => s + r.upserted, 0);
  const successCount = results.filter((r) => r.status === "ok").length;
  const totalSeconds = ((Date.now() - startedAt.getTime()) / 1000).toFixed(1);

  console.log(
    `[refresh] done in ${totalSeconds}s · ${successCount}/${results.length} chains succeeded · ${totalUpserted} total upserts`
  );
  // Machine-readable summary line for log scrapers / monitoring.
  console.log(`[refresh] SUMMARY ${JSON.stringify({ results, totalUpserted, successCount })}`);

  // Exit 0 if at least one chain succeeded; non-zero only when everything failed.
  process.exit(successCount > 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[refresh] fatal:", err);
  process.exit(1);
});
