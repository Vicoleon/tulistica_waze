import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Brand, User, VendorApplication } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";

vi.mock("./db", () => ({
  getUserById: vi.fn(),
  getPendingApplicationForUser: vi.fn(),
  getLatestApplicationForUser: vi.fn(),
  createVendorApplication: vi.fn(),
  listPendingApplications: vi.fn(),
  getVendorApplicationById: vi.fn(),
  markApplicationDecided: vi.fn(),
  promoteUserToVendorAdmin: vi.fn(),
  createBrand: vi.fn(),
  createBrandMember: vi.fn(),
  getAllMembershipsForUser: vi.fn(),
  getVendorMembershipsForUser: vi.fn(),
  getAdvertiserMembershipsForUser: vi.fn(),
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
    name: "Applicant",
    email: "applicant@example.com",
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

function makeApp(overrides: Partial<VendorApplication> = {}): VendorApplication {
  return {
    id: 11,
    applicantUserId: 1,
    companyName: "Pulpería La Esquina",
    contactName: null,
    contactPhone: null,
    description: null,
    desiredStoresNote: null,
    status: "pending",
    reviewerNote: null,
    reviewedByUserId: null,
    reviewedAt: null,
    resultingBrandId: null,
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

describe("vendorApplications.submit", () => {
  beforeEach(() => {
    vi.mocked(db.getPendingApplicationForUser).mockReset();
    vi.mocked(db.createVendorApplication).mockReset();
  });

  it("rejects when user already has a pending application", async () => {
    vi.mocked(db.getPendingApplicationForUser).mockResolvedValue(makeApp());
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    await expect(
      caller.vendorApplications.submit({ companyName: "Acme" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rejects unverified user (verifiedProcedure gate)", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ emailVerified: false })));
    await expect(
      caller.vendorApplications.submit({ companyName: "Acme" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates application on happy path", async () => {
    vi.mocked(db.getPendingApplicationForUser).mockResolvedValue(undefined);
    vi.mocked(db.createVendorApplication).mockResolvedValue(42);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    const result = await caller.vendorApplications.submit({
      companyName: "Acme",
      contactName: "Jane",
    });
    expect(result).toEqual({ applicationId: 42 });
    expect(vi.mocked(db.createVendorApplication)).toHaveBeenCalledWith(
      expect.objectContaining({ applicantUserId: 1, companyName: "Acme" }),
    );
  });
});

describe("vendorApplications.myStatus", () => {
  beforeEach(() => {
    vi.mocked(db.getLatestApplicationForUser).mockReset();
  });

  it("returns null when user has no applications", async () => {
    vi.mocked(db.getLatestApplicationForUser).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    const result = await caller.vendorApplications.myStatus();
    expect(result).toEqual({ application: null });
  });

  it("returns the latest application regardless of status", async () => {
    const rejected = makeApp({ status: "rejected", reviewerNote: "missing tax id" });
    vi.mocked(db.getLatestApplicationForUser).mockResolvedValue(rejected);
    const caller = appRouter.createCaller(makeCtx(makeUser()));
    const result = await caller.vendorApplications.myStatus();
    expect(result.application).toMatchObject({ status: "rejected", reviewerNote: "missing tax id" });
  });
});

describe("vendorApplications.listPending", () => {
  it("rejects non-super-admin (consumer)", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.vendorApplications.listPending()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns pending list for super_admin", async () => {
    vi.mocked(db.listPendingApplications).mockResolvedValue([makeApp({ id: 1 }), makeApp({ id: 2 })]);
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "super_admin" })));
    const result = await caller.vendorApplications.listPending();
    expect(result).toHaveLength(2);
  });
});

describe("vendorApplications.approve", () => {
  beforeEach(() => {
    vi.mocked(db.getVendorApplicationById).mockReset();
    vi.mocked(db.getUserById).mockReset();
    vi.mocked(db.createBrand).mockReset();
    vi.mocked(db.createBrandMember).mockReset();
    vi.mocked(db.promoteUserToVendorAdmin).mockReset();
    vi.mocked(db.markApplicationDecided).mockReset();
  });

  it("rejects non-super-admin", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.vendorApplications.approve({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects when application is not pending", async () => {
    vi.mocked(db.getVendorApplicationById).mockResolvedValue(makeApp({ status: "approved" }));
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "super_admin" })));
    await expect(caller.vendorApplications.approve({ id: 11 })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("creates brand + member + promotes user + marks decided", async () => {
    vi.mocked(db.getVendorApplicationById).mockResolvedValue(makeApp({ id: 11, applicantUserId: 1, companyName: "Acme" }));
    vi.mocked(db.getUserById).mockResolvedValue(makeUser({ id: 1, email: "a@b.com" }));
    vi.mocked(db.createBrand).mockResolvedValue(500);
    vi.mocked(db.createBrandMember).mockResolvedValue(undefined);
    vi.mocked(db.promoteUserToVendorAdmin).mockResolvedValue(undefined);
    vi.mocked(db.markApplicationDecided).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(makeUser({ id: 99, role: "super_admin" })));
    const result = await caller.vendorApplications.approve({ id: 11, reviewerNote: "looks good" });
    expect(result.brandId).toBe(500);
    expect(vi.mocked(db.createBrand)).toHaveBeenCalledWith(expect.objectContaining({ kind: "vendor", companyName: "Acme" }));
    expect(vi.mocked(db.createBrandMember)).toHaveBeenCalledWith(expect.objectContaining({ brandId: 500, userId: 1, membershipRole: "owner" }));
    expect(vi.mocked(db.promoteUserToVendorAdmin)).toHaveBeenCalledWith(1);
    expect(vi.mocked(db.markApplicationDecided)).toHaveBeenCalledWith(expect.objectContaining({
      id: 11, status: "approved", reviewerNote: "looks good", reviewedByUserId: 99, resultingBrandId: 500,
    }));
  });
});

describe("vendorApplications.reject", () => {
  beforeEach(() => {
    vi.mocked(db.getVendorApplicationById).mockReset();
    vi.mocked(db.markApplicationDecided).mockReset();
    vi.mocked(db.createBrand).mockReset();
    vi.mocked(db.promoteUserToVendorAdmin).mockReset();
  });

  it("rejects non-super-admin", async () => {
    const caller = appRouter.createCaller(makeCtx(makeUser({ role: "consumer" })));
    await expect(caller.vendorApplications.reject({ id: 1 })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("marks application rejected, does not create brand, does not touch role", async () => {
    vi.mocked(db.getVendorApplicationById).mockResolvedValue(makeApp({ id: 11 }));
    vi.mocked(db.markApplicationDecided).mockResolvedValue(undefined);
    const caller = appRouter.createCaller(makeCtx(makeUser({ id: 99, role: "super_admin" })));
    await caller.vendorApplications.reject({ id: 11, reviewerNote: "missing info" });
    expect(vi.mocked(db.markApplicationDecided)).toHaveBeenCalledWith(expect.objectContaining({
      id: 11, status: "rejected", reviewerNote: "missing info", reviewedByUserId: 99,
    }));
    expect(vi.mocked(db.createBrand)).not.toHaveBeenCalled();
    expect(vi.mocked(db.promoteUserToVendorAdmin)).not.toHaveBeenCalled();
  });
});
