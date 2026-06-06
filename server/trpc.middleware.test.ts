import { describe, expect, it, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { Brand, User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

// Mock the db module before importing trpc so getVendorMembershipsForUser is stubbable.
vi.mock("./db", () => ({
  getVendorMembershipsForUser: vi.fn(),
  getAdvertiserMembershipsForUser: vi.fn(),
}));

import * as db from "./db";
import {
  protectedProcedure,
  verifiedProcedure,
  superAdminProcedure,
  vendorStaffProcedure,
  vendorAdminProcedure,
  router,
} from "./_core/trpc";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "test-user",
    name: "Test",
    email: "test@example.com",
    passwordHash: null,
    role: "consumer",
    emailVerified: true,
    emailVerifiedAt: new Date(),
    trustScore: 10,
    totalPoints: 0,
    priceReportsCount: 0,
    verifiedReportsCount: 0,
    homeLatitude: null,
    homeLongitude: null,
    defaultRadiusKm: 10,
    fuelCostPerKm: 250,
    timeValuePerHour: 3000,
    preferences: null,
    loginMethod: "local",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

function makeCtx(user: User | null, brand: Brand | null = null): TrpcContext {
  return {
    user,
    brand,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

function makeBrand(kind: "vendor" | "advertiser" = "vendor"): Brand {
  return {
    id: 99,
    companyName: "Acme",
    email: "acme@example.com",
    passwordHash: "h",
    passwordSalt: "s",
    emailVerified: true,
    logoUrl: null,
    contactName: null,
    phone: null,
    country: null,
    status: "active",
    kind,
    billingEmail: null,
    taxId: null,
    paymentMethodLast4: null,
    paymentMethodBrand: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: null,
  };
}

describe("verifiedProcedure", () => {
  // Email-verification gating is intentionally disabled until an SMTP/email
  // service is wired up (see the note in server/_core/trpc.ts). While disabled,
  // an authenticated-but-unverified user is allowed through. When email delivery
  // is restored, re-add the `!ctx.user.emailVerified` check and flip this test
  // back to asserting `rejects` with code "FORBIDDEN".
  it("currently allows unverified user (email gating disabled until SMTP exists)", async () => {
    const r = router({ x: verifiedProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser({ emailVerified: false })));
    await expect(caller.x()).resolves.toBe("ok");
  });

  it("allows verified user", async () => {
    const r = router({ x: verifiedProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser({ emailVerified: true })));
    await expect(caller.x()).resolves.toBe("ok");
  });

  it("blocks no-user with UNAUTHORIZED", async () => {
    const r = router({ x: verifiedProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(null));
    await expect(caller.x()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("superAdminProcedure", () => {
  it("allows super_admin", async () => {
    const r = router({ x: superAdminProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser({ role: "super_admin" })));
    await expect(caller.x()).resolves.toBe("ok");
  });

  it("blocks consumer with FORBIDDEN", async () => {
    const r = router({ x: superAdminProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.x()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("blocks vendor_admin with FORBIDDEN (different role)", async () => {
    const r = router({ x: superAdminProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser({ role: "vendor_admin" })));
    await expect(caller.x()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("vendorStaffProcedure", () => {
  beforeEach(() => {
    vi.mocked(db.getVendorMembershipsForUser).mockReset();
  });

  it("blocks user with no vendor memberships", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([]);
    const r = router({ x: vendorStaffProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser()));
    await expect(caller.x()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows user with at least one vendor membership", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand("vendor"), membershipRole: "staff" },
    ]);
    const r = router({ x: vendorStaffProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser()));
    await expect(caller.x()).resolves.toBe("ok");
  });
});

describe("vendorAdminProcedure", () => {
  beforeEach(() => {
    vi.mocked(db.getVendorMembershipsForUser).mockReset();
  });

  it("rejects user whose only membership is staff role", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand("vendor"), membershipRole: "staff" },
    ]);
    const r = router({ x: vendorAdminProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser()));
    await expect(caller.x()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("allows owner", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand("vendor"), membershipRole: "owner" },
    ]);
    const r = router({ x: vendorAdminProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser()));
    await expect(caller.x()).resolves.toBe("ok");
  });

  it("allows admin", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand("vendor"), membershipRole: "admin" },
    ]);
    const r = router({ x: vendorAdminProcedure.query(() => "ok") });
    const caller = r.createCaller(makeCtx(makeUser()));
    await expect(caller.x()).resolves.toBe("ok");
  });
});
