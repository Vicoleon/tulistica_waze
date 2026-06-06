/**
 * Daily price-report streak — the daily-return habit hook. A streak is the
 * number of consecutive calendar days the user has reported at least one price.
 */

/** Multiplier applied to a report's points once the streak is hot. */
export const STREAK_HOT_DAYS = 7;
export const STREAK_HOT_MULTIPLIER = 1.5;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Next streak value given the last report time and the current streak.
 * - same day → unchanged (but at least 1)
 * - next consecutive day → +1
 * - a gap (or first ever) → reset to 1
 */
export function computeStreak(
  lastReportAt: Date | string | null | undefined,
  currentStreak: number,
  now: number = Date.now(),
): number {
  if (!lastReportAt) return 1;
  const last = lastReportAt instanceof Date ? lastReportAt : new Date(lastReportAt);
  const lastMs = last.getTime();
  if (!Number.isFinite(lastMs)) return 1;
  const lastDay = Math.floor(lastMs / DAY_MS);
  const nowDay = Math.floor(now / DAY_MS);
  const diff = nowDay - lastDay;
  if (diff <= 0) return Math.max(1, currentStreak);
  if (diff === 1) return currentStreak + 1;
  return 1;
}

/** Points multiplier for a given streak length. */
export function streakMultiplier(streak: number): number {
  return streak >= STREAK_HOT_DAYS ? STREAK_HOT_MULTIPLIER : 1;
}
