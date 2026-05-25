/**
 * Registry of available scrapers. Add a new chain by creating an entry here
 * and pointing it at the appropriate scraper implementation.
 */

import { VtexScraper, scrapeVtex } from "./vtex";
import { scrapeAutoMercado, automercadoMeta } from "./automercado";
import { runAutoMercadoDiagnostic } from "./automercado-diagnose";
import { scrapePriceSmart, pricesmartMeta } from "./pricesmart";
import { runPriceSmartDiagnostic } from "./pricesmart-diagnose";
import { scrapeMegaSuper, megasuperMeta } from "./megasuper";
import { runMegaSuperDiagnostic } from "./megasuper-diagnose";
import { recordScrapedProduct, emptyStats } from "./persist";
import type { ScrapeOptions, ScrapeStats } from "./base";

export type ScraperRunner = (options: ScrapeOptions) => Promise<ScrapeStats>;

function runVtex(chainId: string, chainName: string, origin: string): ScraperRunner {
  return async (options) => {
    const stats = emptyStats();
    const scraper = new VtexScraper({ chainId, chainName, origin });
    await scrapeVtex(scraper, options, async (product) => {
      stats.parsed++;
      try {
        await recordScrapedProduct(chainId, chainName, product);
        stats.upserted++;
      } catch (err) {
        stats.errors++;
        throw err;
      }
    });
    return stats;
  };
}

export const SCRAPERS: Record<string, { name: string; runner: ScraperRunner }> = {
  walmart: {
    name: "Walmart Costa Rica",
    runner: runVtex("walmart", "Walmart", "https://www.walmart.co.cr"),
  },
  maxipali: {
    name: "MaxiPalí",
    runner: runVtex("maxipali", "MaxiPalí", "https://www.maxipali.co.cr"),
  },
  masxmenos: {
    name: "Más x Menos",
    runner: runVtex("masxmenos", "Más x Menos", "https://www.masxmenos.cr"),
  },
  automercado: {
    name: "Auto Mercado",
    runner: async (options) => {
      // Diagnostic mode — capture real selectors / network calls instead of scraping.
      // Trigger with: AM_DIAGNOSE=1 pnpm scrape automercado --limit 1
      if (process.env.AM_DIAGNOSE === "1") {
        await runAutoMercadoDiagnostic();
        return emptyStats();
      }

      const stats = emptyStats();
      try {
        const result = await scrapeAutoMercado(options, async (product) => {
          stats.parsed++;
          try {
            await recordScrapedProduct(automercadoMeta.chainId, automercadoMeta.chainName, product);
            stats.upserted++;
          } catch (err) {
            stats.errors++;
            console.warn(`[automercado] persist failed: ${err}`);
          }
        });
        stats.fetched = result.fetched;
        if (!result.loggedIn && result.credentialId) {
          console.warn(`[automercado] credential ${result.credentialId} did not log in; scraping anonymously`);
        }
      } catch (err) {
        stats.errors++;
        throw err;
      }
      return stats;
    },
  },
  pricesmart: {
    name: "PriceSmart",
    runner: async (options) => {
      const stats = emptyStats();
      if (process.env.PS_DIAGNOSE === "1") {
        await runPriceSmartDiagnostic();
        return stats;
      }
      try {
        const result = await scrapePriceSmart(options, async (product) => {
          stats.parsed++;
          try {
            await recordScrapedProduct(pricesmartMeta.chainId, pricesmartMeta.chainName, product);
            stats.upserted++;
          } catch (err) {
            stats.errors++;
            console.warn(`[pricesmart] persist failed: ${err}`);
          }
        });
        stats.fetched = result.fetched;
        // Only real failures count toward errors — 404s and out-of-stock items
        // are informational, not bugs.
        if (result.failed > 0) stats.errors += result.failed;
        if (result.stale404 > 0 || result.outOfStock > 0) {
          console.log(
            `[pricesmart] stale=${result.stale404} out-of-stock=${result.outOfStock} (ignored)`
          );
        }
      } catch (err) {
        stats.errors++;
        throw err;
      }
      return stats;
    },
  },
};

// MegaSuper: Next.js storefront on top of Instaleap. Category tree comes from
// the Instaleap GraphQL API (direct fetch, no auth). Products come from the
// SSR'd category pages at `/ca/{slug}` — extracted via DOM. Diagnostic mode:
// `MS_DIAGNOSE=1 pnpm scrape megasuper --limit 1` to recapture API/selectors.
SCRAPERS["megasuper"] = {
  name: "MegaSuper",
  runner: async (options) => {
    const stats = emptyStats();
    if (process.env.MS_DIAGNOSE === "1") {
      await runMegaSuperDiagnostic();
      return stats;
    }
    try {
      const result = await scrapeMegaSuper(options, async (product) => {
        stats.parsed++;
        try {
          await recordScrapedProduct(megasuperMeta.chainId, megasuperMeta.chainName, product);
          stats.upserted++;
        } catch (err) {
          stats.errors++;
          console.warn(`[megasuper] persist failed: ${err}`);
        }
      });
      stats.fetched = result.fetched;
      if (result.failed > 0) stats.errors += result.failed;
      console.log(
        `[megasuper] scraped ${result.categoriesScraped}/${result.totalCategories} categories`
      );
    } catch (err) {
      stats.errors++;
      throw err;
    }
    return stats;
  },
};

// Note on other CR chains:
// - Perimercados: .com domain parked; chain may have no e-commerce presence.
// - Pequeño Mundo: redirects, needs investigation.
