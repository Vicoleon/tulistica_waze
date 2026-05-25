import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Brand, User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { ENV } from "./env";
import { getBrandSessionFromRequest } from "../services/brandAuth";
import { getBrandById } from "../db";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  brand: Brand | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;
  let brand: Brand | null = null;

  try {
    if (sdk.isMockAuth()) {
      user = {
        id: 1,
        openId: ENV.ownerOpenId || "mock-user-id",
        name: "Mock User",
        email: "mock@local.dev",
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
        fuelCostPerKm: 0.15,
        timeValuePerHour: 15,
        priceReportsCount: 0,
        verifiedReportsCount: 0,
        defaultRadiusKm: 10,
        preferences: {},
        updatedAt: new Date(),
      } as User;
    } else {
      user = await sdk.authenticateRequest(opts.req);
    }
  } catch {
    user = null;
  }

  try {
    const session = await getBrandSessionFromRequest(opts.req);
    if (session) {
      const found = await getBrandById(session.brandId);
      brand = found ?? null;
    }
  } catch {
    brand = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    brand,
  };
}
