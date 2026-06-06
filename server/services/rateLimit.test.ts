import { describe, expect, it } from "vitest";
import { isWithinReportCooldown, PRICE_REPORT_COOLDOWN_MS } from "./rateLimit";

const NOW = 1_700_000_000_000; // fixed epoch ms for determinism

describe("rateLimit.isWithinReportCooldown", () => {
  it("is false when there is no prior submission", () => {
    expect(isWithinReportCooldown(null, NOW)).toBe(false);
    expect(isWithinReportCooldown(undefined, NOW)).toBe(false);
  });

  it("is true for a submission inside the 6h cooldown", () => {
    const oneHourAgo = new Date(NOW - 60 * 60 * 1000);
    expect(isWithinReportCooldown(oneHourAgo, NOW)).toBe(true);
    // Just inside the boundary.
    const justInside = new Date(NOW - (PRICE_REPORT_COOLDOWN_MS - 1000));
    expect(isWithinReportCooldown(justInside, NOW)).toBe(true);
  });

  it("is false for a submission older than the cooldown", () => {
    const sevenHoursAgo = new Date(NOW - 7 * 60 * 60 * 1000);
    expect(isWithinReportCooldown(sevenHoursAgo, NOW)).toBe(false);
    // Exactly at the boundary is no longer "within" (strict <).
    const exactlyAtBoundary = new Date(NOW - PRICE_REPORT_COOLDOWN_MS);
    expect(isWithinReportCooldown(exactlyAtBoundary, NOW)).toBe(false);
  });

  it("is false for an invalid date", () => {
    expect(isWithinReportCooldown("not-a-date", NOW)).toBe(false);
    expect(isWithinReportCooldown(new Date("nope"), NOW)).toBe(false);
  });

  it("accepts ISO string timestamps inside the window", () => {
    const recentIso = new Date(NOW - 30 * 60 * 1000).toISOString();
    expect(isWithinReportCooldown(recentIso, NOW)).toBe(true);
  });
});
