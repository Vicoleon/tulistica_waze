import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User, Brand } from "../../drizzle/schema";
import * as db from "../db";
import { sdk } from "./sdk";
import { getBrandSessionFromRequest } from "./brandAuth";

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

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  if (!user) {
    user = await loadDevMockUser();
  }

  // Brand session lives in a separate cookie. May coexist with a user session
  // on the same browser — the two never conflict.
  let brand: Brand | null = null;
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
