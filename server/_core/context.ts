import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Brand, User } from "../../drizzle/schema";
import { sdk } from "./sdk";
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
    user = await sdk.authenticateRequest(opts.req);
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
