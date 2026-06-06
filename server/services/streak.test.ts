import { describe, expect, it } from "vitest";
import {
  computeStreak,
  streakMultiplier,
  STREAK_HOT_DAYS,
  STREAK_HOT_MULTIPLIER,
} from "./streak";

const DAY_MS = 24 * 60 * 60 * 1000;
// A fixed "now" anchored to the start of a UTC day so day-bucket math is exact.
const NOW = 100 * DAY_MS; // day bucket 100

describe("streak.computeStreak", () => {
  it("returns 1 on the first-ever report (null lastReport)", () => {
    expect(computeStreak(null, 0, NOW)).toBe(1);
    expect(computeStreak(undefined, 5, NOW)).toBe(1);
  });

  it("keeps the streak unchanged for a same-day report (at least 1)", () => {
    // Same day bucket as NOW (NOW is the start of its bucket; +1s stays in it).
    const laterSameDay = new Date(NOW + 1000);
    expect(computeStreak(laterSameDay, 4, NOW)).toBe(4);
    // A current streak below 1 is floored to 1.
    expect(computeStreak(laterSameDay, 0, NOW)).toBe(1);
    // NOW exactly is also same-day.
    expect(computeStreak(new Date(NOW), 6, NOW)).toBe(6);
  });

  it("increments the streak on the next consecutive day", () => {
    // One full day bucket earlier than NOW.
    const yesterday = new Date(NOW - 1);
    expect(computeStreak(yesterday, 3, NOW)).toBe(4);
  });

  it("resets to 1 after a multi-day gap", () => {
    const threeDaysAgo = new Date(NOW - 2 * DAY_MS - 1);
    expect(computeStreak(threeDaysAgo, 10, NOW)).toBe(1);
  });

  it("returns 1 for an invalid date", () => {
    expect(computeStreak("not-a-date", 9, NOW)).toBe(1);
    expect(computeStreak(new Date("nope"), 9, NOW)).toBe(1);
  });

  it("accepts ISO string timestamps", () => {
    const yesterdayIso = new Date(NOW - DAY_MS).toISOString();
    expect(computeStreak(yesterdayIso, 2, NOW)).toBe(3);
  });
});

describe("streak.streakMultiplier", () => {
  it("is 1 below the hot threshold", () => {
    expect(streakMultiplier(0)).toBe(1);
    expect(streakMultiplier(STREAK_HOT_DAYS - 1)).toBe(1);
  });

  it(`is ${STREAK_HOT_MULTIPLIER} once the streak is hot (>= ${STREAK_HOT_DAYS})`, () => {
    expect(streakMultiplier(STREAK_HOT_DAYS)).toBe(STREAK_HOT_MULTIPLIER);
    expect(streakMultiplier(STREAK_HOT_DAYS + 10)).toBe(STREAK_HOT_MULTIPLIER);
  });
});
