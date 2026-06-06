/**
 * Anti-abuse limits for crowdsourced price reporting. Keeps the points economy
 * and the price dataset honest: a user can't farm points (or poison prices) by
 * re-submitting the same (store, product) on a loop, and can't flood overall.
 */

/** Cooldown before the same user can re-report the same (store, product). */
export const PRICE_REPORT_COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6 hours

/** Rolling window + cap for a single user's total submissions. */
export const PRICE_REPORT_RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
export const PRICE_REPORT_MAX_PER_WINDOW = 40;

/** A price report counts as a "new product" contribution within this window. */
export const NEW_PRODUCT_BONUS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** True if `lastSubmittedAt` is recent enough to be inside the dedupe cooldown. */
export function isWithinReportCooldown(
  lastSubmittedAt: Date | string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!lastSubmittedAt) return false;
  const t =
    lastSubmittedAt instanceof Date
      ? lastSubmittedAt.getTime()
      : new Date(lastSubmittedAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t < PRICE_REPORT_COOLDOWN_MS;
}
