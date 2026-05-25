import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Brand, Store, StoreClaim, User } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getUserById: vi.fn(),
  getStoreById: vi.fn(),
  searchUnclaimedStores: vi.fn(),
  createStoreClaim: vi.fn(),
  getPendingClaimForBrandStore: vi.fn(),
  getStoreClaimById: vi.fn(),
  listPendingStoreClaims: vi.fn(),
  listStoreClaimsForBrand: vi.fn(),
  listStoresForBrand: vi.fn(),
  markStoreClaimDecided: vi.fn(),
  linkStoreToBrand: vi.fn(),
  getVendorMembershipsForUser: vi.fn(),
  getAdvertiserMembershipsForUser: vi.fn(),
  getAllMembershipsForUser: vi.fn(),
  upsertUser: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn(async () => undefined),
}));

vi.mock("./services/userAuth", async () => {
  const actual = await vi.importActual<typeof import("./services/userAuth")>("./services/userAuth");
  return { ...actual, sendUserEmail: vi.fn(async () => ({ delivered: true })) };
});

import * as db from "./db";
import { appRouter } from "./routers";

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "u1",
    name: "User",
    email: "user@example.com",
    passwordHash: null,
    role: "vendor_admin",
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
    id: 50,
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
    kind: "vendor",
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

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    id: 200,
    name: "Walmart Liberia",
    chainId: "walmart",
    address: "Liberia, Guanacaste",
    city: "Liberia",
    state: null,
    zipCode: null,
    latitude: 10.633,
    longitude: -85.437,
    phone: null,
    hours: null,
    imageUrl: null,
    avgRating: 0,
    totalRatings: 0,
    isActive: true,
    brandId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeClaim(overrides: Partial<StoreClaim> = {}): StoreClaim {
  return {
    id: 11,
    brandId: 50,
    storeId: 200,
    claimantUserId: 1,
    justification: null,
    status: "pending",
    reviewerNote: null,
    reviewedByUserId: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(user: User | null, brand: Brand | null = null): TrpcContext {
  return {
    user,
    brand,
    req: { headers: {}, protocol: "https" } as TrpcContext["req"],
    res: { cookie: vi.fn(), clearCookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

describe("storeClaims.claim", () => {
  beforeEach(() => {
    vi.mocked(db.getVendorMembershipsForUser).mockReset();
    vi.mocked(db.getStoreById).mockReset();
    vi.mocked(db.getPendingClaimForBrandStore).mockReset();
    vi.mocked(db.createStoreClaim).mockReset();
  });

  it("rejects vendor_staff (vendorAdminProcedure)", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "staff" },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand()));
    await expect(caller.storeClaims.claim({ storeId: 200 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects when no active brand on ctx", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "owner" },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser(), null));
    await expect(caller.storeClaims.claim({ storeId: 200 })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });

  it("rejects when store doesn't exist", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "owner" },
    ]);
    vi.mocked(db.getStoreById).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand()));
    await expect(caller.storeClaims.claim({ storeId: 999 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("rejects when store is already claimed", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "owner" },
    ]);
    vi.mocked(db.getStoreById).mockResolvedValue(makeStore({ brandId: 999 }));
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand()));
    await expect(caller.storeClaims.claim({ storeId: 200 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("rejects when brand has a pending claim for the same store", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "owner" },
    ]);
    vi.mocked(db.getStoreById).mockResolvedValue(makeStore({ brandId: null }));
    vi.mocked(db.getPendingClaimForBrandStore).mockResolvedValue(makeClaim());
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand()));
    await expect(caller.storeClaims.claim({ storeId: 200 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("creates claim on happy path", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "owner" },
    ]);
    vi.mocked(db.getStoreById).mockResolvedValue(makeStore({ brandId: null }));
    vi.mocked(db.getPendingClaimForBrandStore).mockResolvedValue(undefined);
    vi.mocked(db.createStoreClaim).mockResolvedValue(77);
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand({ id: 50 })));
    const result = await caller.storeClaims.claim({
      storeId: 200,
      justification: "I own this Walmart",
    });
    expect(result).toEqual({ claimId: 77 });
    expect(vi.mocked(db.createStoreClaim)).toHaveBeenCalledWith(
      expect.objectContaining({
        brandId: 50,
        storeId: 200,
        claimantUserId: 1,
        justification: "I own this Walmart",
      }),
    );
  });
});

describe("storeClaims.approve", () => {
  beforeEach(() => {
    vi.mocked(db.getStoreClaimById).mockReset();
    vi.mocked(db.getStoreById).mockReset();
    vi.mocked(db.linkStoreToBrand).mockReset();
    vi.mocked(db.markStoreClaimDecided).mockReset();
    vi.mocked(db.getUserById).mockReset();
  });

  it("rejects non-super-admin", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.storeClaims.approve({ id: 1 })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects when claim is not pending", async () => {
    vi.mocked(db.getStoreClaimById).mockResolvedValue(makeClaim({ status: "approved" }));
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "super_admin" })));
    await expect(caller.storeClaims.approve({ id: 11 })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("race: rejects when store became claimed between submit and approve", async () => {
    vi.mocked(db.getStoreClaimById).mockResolvedValue(makeClaim());
    vi.mocked(db.getStoreById).mockResolvedValue(makeStore({ brandId: 999 }));
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "super_admin" })));
    await expect(caller.storeClaims.approve({ id: 11 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect(vi.mocked(db.linkStoreToBrand)).not.toHaveBeenCalled();
  });

  it("happy path: links store + marks decided", async () => {
    vi.mocked(db.getStoreClaimById).mockResolvedValue(makeClaim({ id: 11, brandId: 50, storeId: 200 }));
    vi.mocked(db.getStoreById).mockResolvedValue(makeStore({ brandId: null }));
    vi.mocked(db.linkStoreToBrand).mockResolvedValue(undefined);
    vi.mocked(db.markStoreClaimDecided).mockResolvedValue(undefined);
    vi.mocked(db.getUserById).mockResolvedValue(makeUser({ email: "claimant@example.com" }));
    const caller = appRouter.createCaller(makeCtx(makeUser({ id: 99, role: "super_admin" })));
    const result = await caller.storeClaims.approve({ id: 11, reviewerNote: "ok" });
    expect(result).toEqual({ ok: true });
    expect(vi.mocked(db.linkStoreToBrand)).toHaveBeenCalledWith(200, 50);
    expect(vi.mocked(db.markStoreClaimDecided)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, status: "approved", reviewerNote: "ok", reviewedByUserId: 99 }),
    );
  });
});

describe("storeClaims.reject", () => {
  beforeEach(() => {
    vi.mocked(db.getStoreClaimById).mockReset();
    vi.mocked(db.markStoreClaimDecided).mockReset();
    vi.mocked(db.linkStoreToBrand).mockReset();
  });

  it("rejects non-super-admin", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.storeClaims.reject({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("marks rejected, does not link store", async () => {
    vi.mocked(db.getStoreClaimById).mockResolvedValue(makeClaim());
    vi.mocked(db.markStoreClaimDecided).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(makeUser({ id: 99, role: "super_admin" })));
    await caller.storeClaims.reject({ id: 11, reviewerNote: "no proof" });
    expect(vi.mocked(db.markStoreClaimDecided)).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, status: "rejected", reviewerNote: "no proof", reviewedByUserId: 99 }),
    );
    expect(vi.mocked(db.linkStoreToBrand)).not.toHaveBeenCalled();
  });
});

describe("storeClaims.search", () => {
  beforeEach(() => {
    vi.mocked(db.searchUnclaimedStores).mockReset();
    vi.mocked(db.getVendorMembershipsForUser).mockReset();
  });

  it("requires vendor membership", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([]);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    await expect(caller.storeClaims.search({})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns search results", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "staff" },
    ]);
    vi.mocked(db.searchUnclaimedStores).mockResolvedValue([makeStore({ id: 1 }), makeStore({ id: 2 })]);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    const result = await caller.storeClaims.search({ query: "walmart" });
    expect(result).toHaveLength(2);
    expect(vi.mocked(db.searchUnclaimedStores)).toHaveBeenCalledWith(
      expect.objectContaining({ query: "walmart", limit: 50 }),
    );
  });
});

describe("storeClaims.myStores / myClaims / listPending", () => {
  beforeEach(() => {
    vi.mocked(db.getVendorMembershipsForUser).mockReset();
    vi.mocked(db.listStoresForBrand).mockReset();
    vi.mocked(db.listStoreClaimsForBrand).mockReset();
    vi.mocked(db.listPendingStoreClaims).mockReset();
  });

  it("myStores returns stores for the active brand", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "staff" },
    ]);
    vi.mocked(db.listStoresForBrand).mockResolvedValue([makeStore({ id: 1 }), makeStore({ id: 2 })]);
    const caller = appRouter.createCaller(makeCtx(makeUser(), makeBrand({ id: 50 })));
    const result = await caller.storeClaims.myStores();
    expect(result).toHaveLength(2);
    expect(vi.mocked(db.listStoresForBrand)).toHaveBeenCalledWith(50);
  });

  it("myStores rejects when no active brand", async () => {
    vi.mocked(db.getVendorMembershipsForUser).mockResolvedValue([
      { brand: makeBrand(), membershipRole: "staff" },
    ]);
    const caller = appRouter.createCaller(makeCtx(makeUser(), null));
    await expect(caller.storeClaims.myStores()).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("listPending rejects non-super-admin", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.storeClaims.listPending()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
