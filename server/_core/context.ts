import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Brand, User } from "../../drizzle/schema";
import * as db from "../db";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { getBrandSessionFromRequest } from "../services/brandAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  brand: Brand | null;
};

/**
 * Dev-only escape hatch. When `DEV_MOCK_USER_ID` is set in a non-production
 * environment, every tRPC request is treated as authenticated as that user.
 * Lets us review the redesign with real DB data without standing up the
 * OAuth portal locally. The flag is ignored in production builds.
 */
async function loadDevMockUser(): Promise<User | null> {
  if (process.env.NODE_ENV === "production") return null;
  const raw = process.env.DEV_MOCK_USER_ID;
  if (!raw) return null;
  const id = Number(raw);
  if (!Number.isFinite(id)) return null;
  try {
    return (await db.getUserById(id)) ?? null;
  } catch (error) {
    console.warn("[Auth] DEV_MOCK_USER_ID lookup failed:", error);
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let brand: Brand | null = null;

  try {
    if (sdk.isMockAuth()) {
      // In MOCK_AUTH mode, layer any in-memory preferences updates on top of
      // the hardcoded mock user. Without this, trpc.profile.update would
      // succeed but the next auth.me would return stale empty preferences,
      // bouncing the user back to /onboarding.
      const mockPrefs = db.getMockPreferences(1) ?? {};
      user = {
        id: 1,
        openId: ENV.ownerOpenId || "mock-user-id",
        name: "Mock User",
        email: "mock@local.dev",
        passwordHash: null,
        role: "admin", // Admin access for development
        trustScore: 100,
        totalPoints: 1000,
        createdAt: new Date(),
        lastSignedIn: new Date(),
        loginMethod: "mock",
        isBlocked: false,
        avatarUrl: null,
        homeLatitude: 9.9281,
        homeLongitude: -84.0907,
        fuelCostPerKm: 250, // ₡250/km CRC
        timeValuePerHour: 3000, // ₡3,000/hr CRC
        priceReportsCount: 0,
        verifiedReportsCount: 0,
        defaultRadiusKm: 10,
        preferences: mockPrefs,
        updatedAt: new Date(),
      } as User;
    } else {
      user = await sdk.authenticateRequest(opts.req);
    }
  } catch {
    user = null;
  }

  if (!user) {
    user = await loadDevMockUser();
  }

  // Brand session lives in a separate cookie. May coexist with a user session
  // on the same browser — the two never conflict.
  try {
    const claims = await getBrandSessionFromRequest(opts.req);
    if (claims) {
      brand = (await db.getBrandById(claims.brandId)) ?? null;
    }
  } catch (error) {
    console.warn("[BrandAuth] Failed to resolve brand session:", error);
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    brand,
  };
}
