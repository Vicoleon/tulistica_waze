import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Brand, User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getAllMembershipsForUser: vi.fn(),
  getVendorMembershipsForUser: vi.fn(),
  getAdvertiserMembershipsForUser: vi.fn(),
  createBrand: vi.fn(),
  createBrandMember: vi.fn(),
  getBrandById: vi.fn(),
  updateBrand: vi.fn(),
}));

import * as db from "./db";
import { appRouter } from "./routers";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "u1",
    name: "User One",
    email: "u1@example.com",
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

function makeBrand(overrides: Partial<Brand> = {}): Brand {
  return {
    id: 100,
    companyName: "Acme",
    email: "acme@example.com",
    passwordHash: "",
    passwordSalt: "",
    emailVerified: true,
    logoUrl: null,
    contactName: null,
    phone: null,
    country: null,
    status: "active",
    kind: "advertiser",
    billingEmail: null,
    taxId: null,
    paymentMethodLast4: null,
    paymentMethodBrand: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: null,
    ...overrides,
  };
}

function makeCtx(user: User | null, brand: Brand | null = null): TrpcContext {
  const cookies: Record<string, { value: string; options: Record<string, unknown> }> = {};
  return {
    user,
    brand,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: {
      cookie: (name: string, value: string, options: Record<string, unknown>) => {
        cookies[name] = { value, options };
      },
      clearCookie: (name: string, options: Record<string, unknown>) => {
        cookies[name] = { value: "", options };
      },
      __cookies: cookies,
    } as unknown as TrpcContext["res"],
  };
}

describe("brandAuth.me", () => {
  beforeEach(() => {
    vi.mocked(db.getAllMembershipsForUser).mockReset();
  });

  it("returns { brand: null, memberships: [] } for anonymous user", async () => {
    const caller = appRouter.createCaller(makeCtx(null, null));
    const result = await caller.brandAuth.me();
    expect(result).toEqual({ brand: null, memberships: [] });
  });

  it("returns the active brand and all memberships for a multi-brand user", async () => {
    vi.mocked(db.getAllMembershipsForUser).mockResolvedValue([
      { brand: makeBrand({ id: 100, companyName: "Acme" }), membershipRole: "owner" },
      { brand: makeBrand({ id: 200, companyName: "Beta" }), membershipRole: "staff" },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand({ id: 100 })));
    const result = await caller.brandAuth.me();
    expect(result.brand?.id).toBe(100);
    expect(result.memberships).toHaveLength(2);
    expect(result.memberships[0].membershipRole).toBe("owner");
  });
});

describe("brandAuth.switchActiveBrand", () => {
  beforeEach(() => {
    vi.mocked(db.getAllMembershipsForUser).mockReset();
  });

  it("rejects brandId the user is not a member of", async () => {
    vi.mocked(db.getAllMembershipsForUser).mockResolvedValue([
      { brand: makeBrand({ id: 100 }), membershipRole: "owner" },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    await expect(caller.brandAuth.switchActiveBrand({ brandId: 999 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("sets cookie and returns brand when user has the membership", async () => {
    vi.mocked(db.getAllMembershipsForUser).mockResolvedValue([
      { brand: makeBrand({ id: 100, companyName: "Acme" }), membershipRole: "owner" },
    ]);
    const ctx = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    const result = await caller.brandAuth.switchActiveBrand({ brandId: 100 });
    expect(result.brand.id).toBe(100);
    expect((ctx.res as any).__cookies.brand_ctx_id?.value).toBe("100");
  });

  it("rejects when user is unauthenticated", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.brandAuth.switchActiveBrand({ brandId: 100 })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("brandAuth.register (rewritten)", () => {
  beforeEach(() => {
    vi.mocked(db.getAllMembershipsForUser).mockReset();
    vi.mocked(db.createBrand).mockReset();
    vi.mocked(db.createBrandMember).mockReset();
    vi.mocked(db.getBrandById).mockReset();
  });

  it("rejects unauthenticated request", async () => {
    const caller = appRouter.createCaller(makeCtx(null));
    await expect(caller.brandAuth.register({ companyName: "Acme" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects duplicate companyName for the same user", async () => {
    vi.mocked(db.getAllMembershipsForUser).mockResolvedValue([
      { brand: makeBrand({ companyName: "Acme" }), membershipRole: "owner" },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    await expect(caller.brandAuth.register({ companyName: "Acme" })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("creates brand + brand_members and sets active-brand cookie", async () => {
    vi.mocked(db.getAllMembershipsForUser).mockResolvedValue([]);
    vi.mocked(db.createBrand).mockResolvedValue(42);
    vi.mocked(db.createBrandMember).mockResolvedValue(undefined);
    vi.mocked(db.getBrandById).mockResolvedValue(makeBrand({ id: 42, companyName: "Newco" }));
    const ctx = makeCtx(makeUser());
    const caller = appRouter.createCaller(ctx);
    const result = await caller.brandAuth.register({ companyName: "Newco" });
    expect(result.brand?.id).toBe(42);
    expect(vi.mocked(db.createBrand)).toHaveBeenCalledOnce();
    expect(vi.mocked(db.createBrandMember)).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 42, membershipRole: "owner" }),
    );
    expect((ctx.res as any).__cookies.brand_ctx_id?.value).toBe("42");
  });
});
